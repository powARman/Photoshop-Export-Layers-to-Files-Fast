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
var scriptFileName = "Export Layers To Files (Fast).jsx";

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

    var scriptFile = File(env.scriptFileDirectory + "/" + scriptFileName);
    scriptFile.open('r');
    var script = scriptFile.read();
    scriptFile.close();

    if (showDialog() === 1) {
        files = buildFileList(prefs.srcFolder);
        for (i = 0; i < files.length; i++) {
            var document = app.open(files[i]);
            app.playbackDisplayDialogs = DialogModes.ERROR;
            eval(script);
            document.close(SaveOptions.DONOTSAVECHANGES);
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
                //throw new Error();		// doesn't provide the file name, at least in CS2
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
