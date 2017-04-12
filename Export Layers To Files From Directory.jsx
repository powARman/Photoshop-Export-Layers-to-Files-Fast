// NAME:
//  Export Layers To Files From Directory

// DESCRIPTION:
//  Iterates throught the files of a directory an executes "Export Layers To Files (Fast)" script for each of them.

// enable double-clicking from Finder/Explorer (CS2 and higher)
#target photoshop
app.bringToFront();

//
// Type definitions
//

var FileNameType = {
    AS_LAYERS: 1,
    AS_LAYERS_NO_EXT: 2,
};

var TrimPrefType = {
    DONT_TRIM: 1,
    INDIVIDUAL: 2,
    COMBINED: 3,
};

// Settings

var USER_SETTINGS_ID = "exportLayersToFilesCustomDefaultSettings";
var DEFAULT_SETTINGS = {
    source: app.stringIDToTypeID("srcFolder"),
    destination: app.stringIDToTypeID("destFolder"),
};

//
// Global variables
//

var env = new Object();
var prefs = new Object();
var userCancelled = false;
var silentMode = true;

var layerCount = 0;
var layers;
var groups;

var logFile;

//
// Entry point
//

bootstrap();

//
// Processing logic
//

function main()
{
    // user preferences
    prefs = new Object();
    prefs.srcFolder = Folder.myDocuments;
    prefs.destFolder = Folder.myDocuments;

    prefs.format = "PNG-24";
    //prefs.format = "TGA";
    if (prefs.format == "PNG-24") {
        prefs.fileExtension = ".png";

        var WHITE = new RGBColor();
        WHITE.red = 255; WHITE.green = 255; WHITE.blue = 255;
        var BLACK = new RGBColor();
        BLACK.red = 0; BLACK.green = 0; BLACK.blue = 0;
        var GRAY = new RGBColor();
        GRAY.red = 127; GRAY.green = 127; GRAY.blue = 127;

        prefs.formatArgs = new ExportOptionsSaveForWeb();
        prefs.formatArgs.format = SaveDocumentType.PNG;
        prefs.formatArgs.interlaced = false;
        prefs.formatArgs.transparency = true;
        // if transparency is false, the matte color comes into play
        prefs.formatArgs.matteColor = WHITE;
        //prefs.formatArgs.matteColor = BLACK;
        //prefs.formatArgs.matteColor = GRAY;
        //prefs.formatArgs.matteColor = app.backgroundColor.rgb;
        //prefs.formatArgs.matteColor = app.foregroundColor.rgb;
    }
    else if (prefs.format == "TGA") {
        prefs.fileExtension = ".tga";
        prefs.formatArgs = new TargaSaveOptions();
        prefs.formatArgs.alphaChannels = true;
        prefs.formatArgs.rleCompression = false;
        prefs.formatArgs.resolution = TargaBitsPerPixels.THIRTYTWO;
    }
    else {
        return "cancel";
    }

    prefs.folder = "";
    prefs.outputPrefix = "";
    prefs.naming = FileNameType.AS_LAYERS_NO_EXT;
    prefs.replaceSpaces = true;
    prefs.bgLayer = false;
    prefs.trim = TrimPrefType.DONT_TRIM;
    prefs.forceTrimMethod = false;
    prefs.groupsAsFolders = true;
    prefs.fileNameAsFolder = true;
    prefs.overwrite = false;

    // create progress bar
    var progressBarWindow = createProgressBar();
    if (! progressBarWindow) {
        return "cancel";
    }

    if (showDialog() === 1) {

        logFile = new File(prefs.destFolder + "/extractLog.txt");
        logFile.open("w");

        files = buildFileList(prefs.srcFolder);

        var cancelled = false;
        for (i = 0; i < files.length && !cancelled; i++) {
            var document = app.open(files[i]);

            setProgressBarTitle(progressBarWindow, i, files.length, document.name);

            app.playbackDisplayDialogs = DialogModes.ERROR;
            if (! exportLayersFromDocument(document, progressBarWindow)) {
                cancelled = true;
            }
            document.close(SaveOptions.DONOTSAVECHANGES);
        }

        logFile.close();

        if (cancelled) {
            return "cancel";
        }
    }
    else {
        return "cancel";
    }
}

function showDialog()
{
    // read dialog resource
    var rsrcFile = new File(env.scriptFileDirectory + "/ExportBatchDialog.json");
    var rsrcString = loadResource(rsrcFile);
    if (! rsrcString) {
        return false;
    }

    // build dialogue
    var dlg;
    try {
        dlg = new Window(rsrcString);
    }
    catch (e) {
        alert("Dialog resource is corrupt! Please, redownload the script with all files.", "Error", true);
        return false;
    }

    // source folder
    dlg.grpSrc.txtSrc.text = prefs.srcFolder.fsName;
    dlg.grpSrc.txtSrc.onChange = function() {
        var srcFolder = new Folder(dlg.grpSrc.txtSrc.text);
        if (srcFolder.exists) {
            prefs.srcFolder = srcFolder;
        }
    };
    dlg.grpSrc.btnSrc.onClick = function() {
        var newFolder = Folder.selectDialog("Select source folder", prefs.srcFolder);
        if (newFolder) {
            prefs.srcFolder = newFolder;
            dlg.grpSrc.txtSrc.text = newFolder.fsName;
        }
    };

    // destination folder
    dlg.grpDest.txtDest.text = prefs.destFolder.fsName;
    dlg.grpDest.txtDest.onChange = function() {
        var destFolder = new Folder(dlg.grpDest.txtDest.text);
        if (destFolder.exists) {
            prefs.destFolder = destFolder;
        }
    };
    dlg.grpDest.btnDest.onClick = function() {
        var newFolder = Folder.selectDialog("Select destination folder", prefs.destFolder);
        if (newFolder) {
            prefs.destFolder = newFolder;
            dlg.grpDest.txtDest.text = newFolder.fsName;
        }
    };

    // buttons
    dlg.buttons.btnRun.onClick = function() {
        saveSettings(dlg)
        dlg.close(1);
    };
    dlg.buttons.btnCancel.onClick = function() {
        dlg.close(0);
    };
    dlg.buttons.btnSave.enabled = env.cs3OrHigher;
    dlg.buttons.btnSave.onClick = function() {
        saveSettings(dlg);
        dlg.close(0);
    };

    try {
        applySettings(dlg);
    }
    catch (err) {
        alert("Failed to restore previous settings. Default settings applied.\n\n(Error: " + err.toString() + ")", "Settings not restored", true);
    }

    dlg.center();
    return dlg.show();
}

function exportLayersFromDocument(document, progressBarWindow)
{
    userCancelled = false;

    logFile.writeln("Extracting " + document.name);

    // count layers
    var layerCountResult = countLayers(progressBarWindow);
    if (userCancelled) {
        return false;
    }
    layerCount = layerCountResult.layerCount;

    prefs.folder = "";
    if (prefs.fileNameAsFolder) {
        prefs.folder = "/" + basename(app.activeDocument.fullName);
    }

    if (prefs.outputPrefix.length > 0) {
        prefs.outputPrefix += " ";
    }

    if (prefs.bgLayer && layerCount <= 1) {
        prefs.bgLayer = false;
    }

    prefs.filePath = prefs.destFolder;

    // collect layers
    var collected = collectLayers(progressBarWindow);
    if (userCancelled) {
        alert("Export cancelled! No files saved.", "Finished", false);
        return "cancel";
    }
    layers = collected.layers;
    groups = collected.groups;

    // create unique folders
    var foldersOk = !prefs.groupsAsFolders;
    if (prefs.groupsAsFolders) {
        foldersOk = createUniqueFolders();
        if (foldersOk !== true) {
            alert(foldersOk + " Not exporting layers.", "Failed", true);
        }
    }

    // export
    if (foldersOk === true) {
        var count = exportLayers(progressBarWindow);

        var showMessage = !silentMode;

        var message = "";
        if (userCancelled) {
            message += "Export cancelled!\n\n";
            showMessage = true;
        }
        message += "Saved " + count.count + " files.";
        if (count.error) {
            message += "\n\nSome layers failed to export! (Are there many layers with the same name?)";
            showMessage = true;
        }
        if (showMessage)
            alert(message, "Finished", count.error);
    }

    return true;
}

// Indexed access to Layers via the default provided API is very slow, so all layers should be
// collected into a separate collection beforehand and that should be accessed repeatedly.
function collectLayers(progressBarWindow)
{
    // proxy to lower level ActionManager code
    return collectLayersAM(progressBarWindow);
}

function countLayers(progressBarWindow)
{
    // proxy to lower level ActionManager code
    return countLayersAM(progressBarWindow);
}

function exportLayers(progressBarWindow)
{
    var retVal = {
        count: 0,
        error: false
    };
    var doc = app.activeDocument;

    // Select a subset of layers to export.

    var layerCount = layers.length;
    var layersToExport;
    layersToExport = layers;

    var count = prefs.bgLayer ? layersToExport.length - 1 : layersToExport.length;

    if (count < 1) {
        return retVal;
    }

    // Export.

    if ((layerCount == 1) && layers[0].layer.isBackgroundLayer) {
        // Flattened images don't support LayerComps or visibility toggling, so export it directly.
        if (saveImage(layers[0].layer.name)) {
            ++retVal.count;
        }
        else {
            retVal.error = true;
        }
    }
    else {
        // Single trim of all layers combined.
        if (prefs.trim == TrimPrefType.COMBINED) {
            var UPDATE_NUM = 20;
            if (progressBarWindow) {
                var stepCount = count / UPDATE_NUM + 1;
                showProgressBar(progressBarWindow, "Trimming...", stepCount);
            }

            // For combined trim across all layers, make all layers visible.
            for (var i = 0; i < count; ++i) {
                makeVisible(layersToExport[i]);

                if (progressBarWindow && (i % UPDATE_NUM == 0)) {
                    updateProgressBar(progressBarWindow);
                    repaintProgressBar(progressBarWindow);
                    if (userCancelled) {
                        progressBarWindow.hide();
                        return retVal;
                    }
                }
            }

            if (prefs.bgLayer) {
                layersToExport[count].layer.visible = false;
            }

            doc.trim(TrimType.TRANSPARENT);
        }

        if (progressBarWindow) {
            showProgressBar(progressBarWindow, "Exporting 1 of " + count + "...", count);
        }

        // Turn off all layers when exporting all layers - even seemingly invisible ones.
        // When visibility is switched, the parent group becomes visible and a previously invisible child may become visible by accident.
        for (var i = 0; i < count; ++i) {
            layersToExport[i].layer.visible = false;
        }
        if (prefs.bgLayer) {
            makeVisible(layersToExport[count]);
        }

        // export layers
        for (var i = 0; i < count; ++i) {
            var layer = layersToExport[i].layer;

            var fileName;
            switch (prefs.naming) {

            case FileNameType.AS_LAYERS_NO_EXT:
                fileName = makeFileNameFromLayerName(layersToExport[i], true);
                break;

            case FileNameType.AS_LAYERS:
                fileName = makeFileNameFromLayerName(layersToExport[i], false);
                break;
            }

            if (fileName) {
                if ((prefs.trim != TrimPrefType.INDIVIDUAL) || ((layer.bounds[0] < layer.bounds[2]) && ((layer.bounds[1] < layer.bounds[3])))) { // skip empty layers when trimming
                    makeVisible(layersToExport[i]);

                    if (prefs.trim == TrimPrefType.INDIVIDUAL) {
                        var useTrim = prefs.forceTrimMethod;

                        if (!useTrim) {
                            try {
                                doc.crop(layer.bounds);
                            }
                            catch (e) {
                                useTrim = true;
                            }
                        }

                        if (useTrim) {
                            doc.trim(TrimType.TRANSPARENT);
                        }
                    }

                    var folderSafe = true;
                    if (prefs.groupsAsFolders) {
                        var parentFolder = (new File(fileName)).parent;
                        folderSafe = createFolder(parentFolder);
                        retVal.error = (retVal.error || !folderSafe);
                    }

                    if (folderSafe) {
                        saveImage(fileName);
                        ++retVal.count;
                    }

                    if (prefs.trim == TrimPrefType.INDIVIDUAL) {
                        undo(doc);
                    }

                    layer.visible = false;
                }
            }
            else {
                retVal.error = true;
            }

            if (progressBarWindow) {
                updateProgressBar(progressBarWindow, "Exporting " + (i + 1) + " of " + count + "...");
                repaintProgressBar(progressBarWindow);
                if (userCancelled) {
                    break;
                }
            }
        }

        if (progressBarWindow) {
            progressBarWindow.hide();
        }
    }

    return retVal;
}

function isAdjustmentLayer(layer)
{
    switch (layer.kind) {

    case LayerKind.BRIGHTNESSCONTRAST:
    case LayerKind.CHANNELMIXER:
    case LayerKind.COLORBALANCE:
    case LayerKind.CURVES:
    case LayerKind.GRADIENTMAP:
    case LayerKind.HUESATURATION:
    case LayerKind.INVERSION:
    case LayerKind.LEVELS:
    case LayerKind.POSTERIZE:
    case LayerKind.SELECTIVECOLOR:
    case LayerKind.THRESHOLD:
        return true;

    default:
        return false;
    }
}

function createFolder(folder)
{
    var result = true;
    var missingFolders = [];

    var parentFolder = folder;
    while (parentFolder) {
        if (!parentFolder.exists) {
            missingFolders.push(parentFolder);
        }

        parentFolder = parentFolder.parent;
    }

    try {
        for (var i = missingFolders.length - 1; i >= 0; --i) {
            if (!missingFolders[i].create()) {
                result = false;
                break;
            }
        }
    }
    catch (e) {
        result = false;
    }

    return result;
}

function createUniqueFolders()
{
    for (var i = 0; i < groups.length; ++i) {
        var group = groups[i];
        var path = makeFolderName(group);
        var folder = new Folder(path);
        if (folder.exists && !prefs.overwrite) {
            var renamed = false;
            for (var j = 1; j <= 100; ++j) {
                var handle = new Folder(path + "-" + padder(j, 3));
                if (!handle.exists) {
                    try {
                        renamed = folder.rename(handle.name);
                    }
                    catch (e) {}
                    break;
                }
            }

            if (!renamed) {
                return "Directory '" + folder.name + "' already exists. Failed to rename.";
            }
        }

        folder = new Folder(path);
        try {
            if (!folder.create()) {
                throw new Error();
            }
        }
        catch (e) {
            return "Failed to create directory '" + folder.name + "'.";
        }
    }

    return true;
}

function saveImage(fileName)
{
    if (prefs.formatArgs instanceof ExportOptionsSaveForWeb) {
        // Document.exportDocument() is unreliable -- it ignores some of the export options.
        // Avoid it if possible.
        switch (prefs.format) {

        case "PNG-24":
            exportPng24AM(fileName, prefs.formatArgs);
            break;

        default:
            app.activeDocument.exportDocument(fileName, ExportType.SAVEFORWEB, prefs.formatArgs);
            break;
        }
    }
    else {
        app.activeDocument.saveAs(fileName, prefs.formatArgs, true, Extension.NONE);
    }

    return true;
}

function exportPng24AM(fileName, options)
{
    var desc = new ActionDescriptor(),
        desc2 = new ActionDescriptor();
    desc2.putEnumerated(app.charIDToTypeID("Op  "), app.charIDToTypeID("SWOp"), app.charIDToTypeID("OpSa"));
    desc2.putEnumerated(app.charIDToTypeID("Fmt "), app.charIDToTypeID("IRFm"), app.charIDToTypeID("PN24"));
    desc2.putBoolean(app.charIDToTypeID("Intr"), options.interlaced);
    desc2.putBoolean(app.charIDToTypeID("Trns"), options.transparency);
    desc2.putBoolean(app.charIDToTypeID("Mtt "), true);
    desc2.putInteger(app.charIDToTypeID("MttR"), options.matteColor.red);
    desc2.putInteger(app.charIDToTypeID("MttG"), options.matteColor.green);
    desc2.putInteger(app.charIDToTypeID("MttB"), options.matteColor.blue);
    desc2.putBoolean(app.charIDToTypeID("SHTM"), false);
    desc2.putBoolean(app.charIDToTypeID("SImg"), true);
    desc2.putBoolean(app.charIDToTypeID("SSSO"), false);
    desc2.putList(app.charIDToTypeID("SSLt"), new ActionList());
    desc2.putBoolean(app.charIDToTypeID("DIDr"), false);
    desc2.putPath(app.charIDToTypeID("In  "), new File(fileName));
    desc.putObject(app.charIDToTypeID("Usng"), app.stringIDToTypeID("SaveForWeb"), desc2);
    app.executeAction(app.charIDToTypeID("Expr"), desc, DialogModes.NO);
}

function makeFolderName(group)
{
    var folderName = makeValidFileName(group.layer.name, prefs.replaceSpaces);
    if (folderName.length == 0) {
        folderName = "Group";
    }

    folderName = prefs.filePath + prefs.folder + "/" + folderName;

    return folderName;
}

function makeFileNameFromLayerName(layer, stripExt)
{
    var fileName = makeValidFileName(layer.layer.name, prefs.replaceSpaces);
    if (stripExt) {
        var dotIdx = fileName.indexOf('.');
        if (dotIdx >= 0) {
            fileName = fileName.substring(0, dotIdx);
        }
    }
    if (fileName.length == 0) {
        fileName = "Layer";
    }
    // AUX is not a valid filename in Windows, so rename it
    if (fileName.toUpperCase() == "AUX")
        fileName = "AUX_renamed";
    return getUniqueFileName(fileName, layer);
}

function getUniqueFileName(fileName, layer)
{
    var ext = prefs.fileExtension;
    // makeValidFileName() here basically just converts the space between the prefix and the core file name,
    // but it's a good idea to keep file naming conventions in one place, i.e. inside makeValidFileName(),
    // and rely on them exclusively.
    var outputPrefix = prefs.groupsAsFolders ? "" : prefs.outputPrefix;
    fileName = makeValidFileName(outputPrefix + fileName, prefs.replaceSpaces);

    var localFolders = "";
    if (prefs.groupsAsFolders) {
        var parent = layer.parent;
        while (parent) {
            localFolders = makeValidFileName(parent.layer.name, prefs.replaceSpaces) + "/" + localFolders;
            parent = parent.parent;
        }
    }

    fileName = prefs.filePath + prefs.folder + "/" + localFolders + fileName;

    // Check if the file already exists. In such case a numeric suffix will be added to disambiguate.
    var uniqueName = fileName;
    for (var i = 1; i <= 100; ++i) {
        var handle = File(uniqueName + ext);
        if (handle.exists && !prefs.overwrite) {
            uniqueName = fileName + "-" + padder(i, 3);
        }
        else {
            return handle;
        }
    }

    return false;
}

function undo(doc)
{
    doc.activeHistoryState = doc.historyStates[doc.historyStates.length-2];
}

function makeVisible(layer)
{
    layer.layer.visible = true;

    var current = layer.parent;
    while (current) {
        if (! current.layer.visible) {
            current.layer.visible = true;
        }
        current = current.parent;
    }
}

function logLayerInfo(layer, indentation)
{
    var boundsString = "" +
            layer.bounds[0].value + " " +
            layer.bounds[1].value + " " +
            (layer.bounds[2].value - layer.bounds[0].value) + " " +
            (layer.bounds[3].value - layer.bounds[1].value);
    var boundsNoFxString = "";

    if (layer.bounds[0] != layer.boundsNoEffects[0] ||
        layer.bounds[1] != layer.boundsNoEffects[1] ||
        layer.bounds[2] != layer.boundsNoEffects[2] ||
        layer.bounds[3] != layer.boundsNoEffects[3]) {
        boundsNoFxString += " (" +
            layer.boundsNoEffects[0].value + " " +
            layer.boundsNoEffects[1].value + " " +
            (layer.boundsNoEffects[2].value - layer.bounds[0].value) + " " +
            (layer.boundsNoEffects[3].value - layer.bounds[1].value) + ")";
    }

    logFile.writeln(indentation + layer.name.replace(/^\s+|\s+$/gm, '') + ": " +
        boundsString + boundsNoFxString);
}
//
// ActionManager mud
//

// Faster layer collection:
//  https://forums.adobe.com/message/2666611

function collectLayersAM(progressBarWindow)
{
    var indentation = "  ";

    var layers = [],
        groups = [];
    var layerCount = 0;

    var ref = null;
    var desc = null;

    var idOrdn = app.charIDToTypeID("Ordn");

    // Get layer count reported by the active Document object - it never includes the background.
    ref = new ActionReference();
    ref.putEnumerated(app.charIDToTypeID("Dcmn"), app.charIDToTypeID("Ordn"), app.charIDToTypeID("Trgt"));
    desc = app.executeActionGet(ref);
    layerCount = desc.getInteger(app.charIDToTypeID("NmbL"));

    if (layerCount == 0) {
        // This is a flattened image that contains only the background (which is always visible).
        var bg = app.activeDocument.backgroundLayer;
        var layer = {layer: bg, parent: null};
        layers.push(layer);
    }
    else {
        // There are more layers that may or may not contain a background. The background is always at 0;
        // other layers are indexed from 1.

        var idLyr = app.charIDToTypeID("Lyr ");
        var idLayerSection = app.stringIDToTypeID("layerSection");
        var idVsbl = app.charIDToTypeID("Vsbl");
        var idNull = app.charIDToTypeID("null");
        var idSlct = app.charIDToTypeID("slct");
        var idMkVs = app.charIDToTypeID("MkVs");

        var FEW_LAYERS = 1;

        if (progressBarWindow) {
            // The layer count is actually + 1 if there's a background present, but it should be no biggie.
            showProgressBar(progressBarWindow, "Collecting layers... Might take up to several seconds.", (layerCount + FEW_LAYERS) / FEW_LAYERS);
        }

        try {
            // Collect normal layers.
            var currentGroup = null;
            var layerSection;
            for (var i = layerCount; i >= 1; --i) {
                // check if it's an art layer (not a group) that can be selected
                ref = new ActionReference();
                ref.putIndex(idLyr, i);
                desc = app.executeActionGet(ref);
                layerSection = app.typeIDToStringID(desc.getEnumerationValue(idLayerSection));
                if ((layerSection == "layerSectionContent")
                    || (layerSection == "layerSectionStart")) {
                    // select the layer and then retrieve it via Document.activeLayer
                    desc.clear();
                    desc.putReference(idNull, ref);
                    desc.putBoolean(idMkVs, false);
                    app.executeAction(idSlct, desc, DialogModes.NO);

                    var activeLayer = app.activeDocument.activeLayer;

                    logLayerInfo(activeLayer, indentation);

                    if (layerSection == "layerSectionContent") {
                        if (! isAdjustmentLayer(activeLayer)) {
                            var layer = {layer: activeLayer, parent: currentGroup};
                            layers.push(layer);
                            if (currentGroup) {
                                currentGroup.children.push(layer);
                            }
                        }
                    }
                    else {
                        indentation += "  ";
                        var group = {layer: activeLayer, parent: currentGroup, children: []};
                        if (group.parent == null) {
                            groups.push(group);
                        }
                        else {
                            group.parent.children.push(group);
                        }
                        currentGroup = group;
                    }
                }
                else if (layerSection == "layerSectionEnd") {
                    indentation = indentation.substr(0, indentation.length - 2);
                    currentGroup = currentGroup.parent;
                }

                if (progressBarWindow && ((i % FEW_LAYERS == 0) || (i == layerCount))) {
                    updateProgressBar(progressBarWindow, "Collecting " + (layerCount - i) + " of " + layerCount + "...");
                    repaintProgressBar(progressBarWindow);
                    if (userCancelled) {
                        throw new Error("cancel");
                    }
                }
            }

            // Collect the background.
            ref = new ActionReference();
            ref.putIndex(idLyr, 0);
            try {
                desc = app.executeActionGet(ref);
                var bg = app.activeDocument.backgroundLayer;
                var layer = {layer: bg, parent: null};
                layers.push(layer);

                if (progressBarWindow) {
                    updateProgressBar(progressBarWindow);
                    repaintProgressBar(progressBarWindow);
                }
            }
            catch (e) {
                // no background, move on
            }
        }
        catch (e) {
            if (e.message != "cancel") throw e;
        }

        if (progressBarWindow) {
            progressBarWindow.hide();
        }
    }

    return {layers: layers, groups: groups};
}

function countLayersAM(progressBarWindow)
{
    var layerCount = 0;
    var preciseLayerCount = 0;

    var ref = null;
    var desc = null;

    var idOrdn = app.charIDToTypeID("Ordn");
    var idLyr = app.charIDToTypeID("Lyr ");

    // Get layer count reported by the active Document object - it never includes the background.
    ref = new ActionReference();
    ref.putEnumerated(app.charIDToTypeID("Dcmn"), app.charIDToTypeID("Ordn"), app.charIDToTypeID("Trgt"));
    desc = app.executeActionGet(ref);
    layerCount = desc.getInteger(app.charIDToTypeID("NmbL"));

    if (layerCount == 0) {
        // This is a flattened image that contains only the background (which is always visible).
        preciseLayerCount = 1;
    }
    else {
        // There are more layers that may or may not contain a background. The background is always at 0;
        // other layers are indexed from 1.

        var idLayerSection = app.stringIDToTypeID("layerSection");
        var idVsbl = app.charIDToTypeID("Vsbl");
        var idNull = app.charIDToTypeID("null");
        var idSlct = app.charIDToTypeID("slct");
        var idMkVs = app.charIDToTypeID("MkVs");

        var FEW_LAYERS = 10;

        if (progressBarWindow) {
            // The layer count is actually + 1 if there's a background present, but it should be no biggie.
            showProgressBar(progressBarWindow, "Counting layers... Might take up to several seconds.", (layerCount + FEW_LAYERS) / FEW_LAYERS);
        }

        try {
            // Collect normal layers.
            var layerSection;
            for (var i = layerCount; i >= 1; --i) {
                // check if it's an art layer (not a group) that can be selected
                ref = new ActionReference();
                ref.putIndex(idLyr, i);
                desc = app.executeActionGet(ref);
                layerSection = app.typeIDToStringID(desc.getEnumerationValue(idLayerSection));
                if (layerSection == "layerSectionContent") {
                    preciseLayerCount++;
                }

                if (progressBarWindow && ((i % FEW_LAYERS == 0) || (i == layerCount))) {
                    updateProgressBar(progressBarWindow);
                    repaintProgressBar(progressBarWindow);
                    if (userCancelled) {
                        throw new Error("cancel");
                    }
                }
            }

            // Collect the background.
            try {
                var bg = app.activeDocument.backgroundLayer;
                preciseLayerCount++;

                if (progressBarWindow) {
                    updateProgressBar(progressBarWindow);
                    repaintProgressBar(progressBarWindow);
                }
            }
            catch (e) {
                // no background, move on
            }
        }
        catch (e) {
            if (e.message != "cancel") throw e;
        }

        if (progressBarWindow) {
            progressBarWindow.hide();
        }
    }

    return {layerCount: preciseLayerCount};
}

//
// Bootstrapper (version support, getting additional environment settings, error handling...)
//

function bootstrap()
{
    function showError(err) {
        alert(err + ': on line ' + err.line, 'Script Error', true);
    }

    try {
        // setup the environment

        env = new Object();

        env.version = parseInt(app.version, 10);

        if (env.version < 9) {
            alert("Photoshop versions before CS2 are not supported!", "Error", true);
            return "cancel";
        }

        env.cs3OrHigher = (env.version >= 10);

        // get script's file name
        if (env.cs3OrHigher) {
            env.scriptFileName = $.fileName;
        }
        else {
            try {
                //throw new Error();        // doesn't provide the file name, at least in CS2
                var illegal = RUNTIME_ERROR;
            }
            catch (e) {
                env.scriptFileName = e.fileName;
            }
        }

        env.scriptFileDirectory = (new File(env.scriptFileName)).parent;

        // run the script itself
        main();
    }
    catch(e) {
        // report errors unless the user cancelled
        if (e.number != 8007)
            showError(e);
        return "cancel";
    }
}

function loadResource(file)
{
    var rsrcString;
    if (! file.exists) {
        alert("Resource file '" + file.name + "' for the export dialog is missing! Please, download the rest of the files that come with this script.", "Error", true);
        return false;
    }
    try {
        file.open("r");
        if (file.error) throw file.error;
        rsrcString = file.read();
        if (file.error) throw file.error;
        if (! file.close()) {
            throw file.error;
        }
    }
    catch (error) {
        alert("Failed to read the resource file '" + file.name + "'!\n\nReason: " + error + "\n\nPlease, check it's available for reading and redownload it in case it became corrupted.", "Error", true);
        return false;
    }

    return rsrcString;
}

function saveSettings(dlg)
{
    if (!env.cs3OrHigher) {
        return;
    }

    var desc;
    try {
        // might throw if settings not present (not saved previously)
        desc = app.getCustomOptions(USER_SETTINGS_ID);
    }
    catch (e) {
        // start fresh
        desc = new ActionDescriptor();
    }

    // Collect settings from the dialog controls.
    with (dlg) {
        desc.putString(DEFAULT_SETTINGS.source, grpSrc.txtSrc.text);
        desc.putString(DEFAULT_SETTINGS.destination, grpDest.txtDest.text);
    }

    // Save settings.
    // "true" means setting persists across Photoshop launches.
    app.putCustomOptions(USER_SETTINGS_ID, desc, true);
}

function loadSettings()
{
    if (!env.cs3OrHigher) {
        return null;
    }

    var desc;
    var result = null;
    try {
        // might throw if settings not present (not saved previously)
        desc = app.getCustomOptions(USER_SETTINGS_ID);

        // might throw if format changed or got corrupt
        result = {
            source: desc.getString(DEFAULT_SETTINGS.source),
            destination: desc.getString(DEFAULT_SETTINGS.destination),
        };
    }
    catch (e) {
        return null;
    }

    return result;
}

function applySettings(dlg)
{
    if (!env.cs3OrHigher) {
        return;
    }

    var settings = loadSettings();
    if (settings == null) {
        return;
    }

    with (dlg) {
        var srcFolder = new Folder(settings.source);
        if (srcFolder.exists) {
            grpSrc.txtSrc.text = srcFolder.fsName;
            prefs.srcFolder = srcFolder;
        }

        var destFolder = new Folder(settings.destination);
        if (destFolder.exists) {
            grpDest.txtDest.text = destFolder.fsName;
            prefs.destFolder = destFolder;
        }
    }
}

function buildFileList(folder)
{
    var list = [];
    var files = folder.getFiles();
    if (files != null) {
        var i;
        for (i = 0; i < files.length; i++) {
            if (files[i] instanceof Folder) {
                var subList = buildFileList(files[i]);
                if (subList != null) {
                    var j;
                    for (j = 0; j < subList.length; j++) {
                        list.push(subList[j]);
                    }
                }
            }
            else {
                var fileName = files[i].name;
                if (fileName.length > 3) {
                    var extension = fileName.substr(fileName.length - 3);
                    if (extension.toUpperCase() == "PSD") {
                        list.push(files[i]);
                    }
                }
            }
        }
    }
    return list;
}

//
// User interface
//

function createProgressBar()
{
    // read progress bar resource
    var rsrcFile = new File(env.scriptFileDirectory + "/ExportBatchProgressBar.json");
    var rsrcString = loadResource(rsrcFile);
    if (! rsrcString) {
        return false;
    }

    // create window
    var win;
    try {
        win = new Window(rsrcString);
    }
    catch (e) {
        alert("Progress bar resource is corrupt! Please, redownload the script with all files.", "Error", true);
        return false;
    }

    win.barRow.cancelBtn.onClick = function() {
        userCancelled = true;
    };

    win.onResizing = win.onResize = function () {
        this.layout.resize();
    }

    win.onClose = function() {
        userCancelled = true;
        return false;
    };
    return win;
}

function setProgressBarTitle(win, index, count, fileName)
{
    win.text = "Processing (" + (index + 1) + "/" + count + "): " + fileName;
}

function showProgressBar(win, message, maxValue)
{
    win.lblMessage.text = message;
    win.barRow.bar.maxvalue = maxValue;
    win.barRow.bar.value = 0;

    win.center();
    win.show();
    repaintProgressBar(win, true);
}

function updateProgressBar(win, message)
{
    ++win.barRow.bar.value;
    if (message) {
        win.lblMessage.text = message;
    }
}

function repaintProgressBar(win, force /* = false*/)
{
    if (env.version >= 11) {    // CS4 added support for UI updates; the previous method became unbearably slow, as is app.refresh()
        if (force) {
            app.refresh();
        }
        else {
            win.update();
        }
    }
    else {
        // CS3 and below
        var d = new ActionDescriptor();
        d.putEnumerated(app.stringIDToTypeID('state'), app.stringIDToTypeID('state'), app.stringIDToTypeID('redrawComplete'));
        app.executeAction(app.stringIDToTypeID('wait'), d, DialogModes.NO);
    }
}

//
// Utilities
//

function padder(input, padLength)
{
    // pad the input with zeroes up to indicated length
    var result = (new Array(padLength + 1 - input.toString().length)).join('0') + input;
    return result;
}

function makeValidFileName(fileName, replaceSpaces)
{
    var validName = fileName.replace(/^\s+|\s+$/gm, '');    // trim spaces
    validName = validName.replace(/[\\\*\/\?:"\|<>]/g, ''); // remove characters not allowed in a file name
    if (replaceSpaces) {
        validName = validName.replace(/[ ]/g, '_');         // replace spaces with underscores, since some programs still may have troubles with them
    }
    return validName;
}

function indexOf(array, element)
{
    var index = -1;
    for (var i = 0; i < array.length; ++i) {
        if (array[i] === element) {
            index = i;
            break;
        }
    }

    return index;
}

function basename(path) {
    var base = new String(path);
    base = base.substring(base.lastIndexOf('/') + 1);
    if (base.lastIndexOf(".") != -1)
        base = base.substring(0, base.lastIndexOf("."));
    return base;
}
