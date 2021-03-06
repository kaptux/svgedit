/* globals jQuery */
/**
 * The main module for the visual SVG Editor.
 *
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria
 * 2010 Pavol Rusnak
 * 2010 Jeff Schiller
 * 2010 Narendra Sisodiya
 * 2014 Brett Zamir
 * @exports module:SVGEditor
 * @borrows module:locale.putLocale as putLocale
 * @borrows module:locale.readLang as readLang
 * @borrows module:locale.setStrings as setStrings
 */

import "./touch.js";
import { NS } from "./namespaces.js";
import {
  isWebkit,
  isChrome,
  isGecko,
  isIE,
  isMac,
  isTouch
} from "./browser.js";
import * as Utils from "./utilities.js";
import { getTypeMap, convertUnit, isValidUnit } from "./units.js";
import {
  hasCustomHandler,
  getCustomHandler,
  injectExtendedContextMenuItemsIntoDom
} from "./contextmenu.js";
import { importSetGlobalDefault } from "./external/dynamic-import-polyfill/importModule.js";
import deparam from "./external/deparam/deparam.esm.js";

import SvgCanvas from "./svgcanvas.js";
import Layer from "./layer.js";

import jQueryPluginJSHotkeys from "./js-hotkeys/jquery.hotkeys.min.js";
import jQueryPluginSVGIcons from "./svgicons/jQuery.svgIcons.js";
import jQueryPluginJGraduate from "./jgraduate/jQuery.jGraduate.js";
import jQueryPluginSpinButton from "./spinbtn/jQuery.SpinButton.js";
import jQueryPluginSVG from "./jQuery.attr.js"; // Needed for SVG attribute setting and array form with `attr`
import jQueryPluginSet from "./jQuery.set.js";
import jQueryPluginDropdown from "./jQuery.dropdown.js";
import jQueryPluginContextMenu from "./contextmenu/jQuery.contextMenu.js";
import jQueryPluginJPicker from "./jgraduate/jQuery.jPicker.js";
import jQueryPluginDBox from "./dbox.js";

import {
  readLang,
  putLocale,
  setStrings,
  init as localeInit
} from "./locale/locale.js";
import loadStylesheets from "./external/load-stylesheets/index-es.js";

const editor = {};

const $ = [
  jQueryPluginJSHotkeys,
  jQueryPluginSVGIcons,
  jQueryPluginJGraduate,
  jQueryPluginSpinButton,
  jQueryPluginSVG,
  jQueryPluginContextMenu,
  jQueryPluginJPicker,
  jQueryPluginSet,
  jQueryPluginDropdown
].reduce((jq, func) => func(jq), jQuery);


const homePage = "https://github.com/SVG-Edit/svgedit";

const stylesheet = "svg-editor.css";
if (!$.loadingStylesheets.includes(stylesheet)) {
  $.loadingStylesheets.push(stylesheet);
}
const favicon = "assets/images/logo.png";
if (
  $.loadingStylesheets.some(item => {
    return !Array.isArray(item) || item[0] !== favicon;
  })
) {
  $.loadingStylesheets.push([favicon, { favicon: true }]);
}

// EDITOR PROPERTIES: (defined below)
//    curPrefs, curConfig, canvas, storage, uiStrings
//
// STATE MAINTENANCE PROPERTIES
/**
 * @type {Float}
 */
editor.tool_scale = 1; // Dependent on icon size, so any use to making configurable instead? Used by `jQuery.SpinButton.js`
/**
 * @type {Integer}
 */
editor.exportWindowCt = 0;
/**
 * @type {boolean}
 */
editor.langChanged = false;
/**
 * @type {boolean}
 */
editor.showSaveWarning = false;
/**
 * Will be set to a boolean by `ext-storage.js`
 * @type {"ignore"|"waiting"|"closed"}
 */
editor.storagePromptState = "ignore";

const callbacks = [],
  /**
   * @typedef {"s"|"m"|"l"|"xl"|Float} module:SVGEditor.IconSize
   */
  /**
   * Preferences.
   * @interface module:SVGEditor.Prefs
   * @property {string} [lang="en"] Two-letter language code. The language must exist in the Editor Preferences language list. Defaults to "en" if `locale.js` detection does not detect another language.
   * @property {module:SVGEditor.IconSize} [iconsize="s"|"m"] Size of the toolbar icons. Will default to 's' if the window height is smaller than the minimum height and 'm' otherwise.
   * @property {string} [bkgd_color="#FFF"] Color hex for canvas background color. Defaults to white.
   * @property {string} [bkgd_url=""] Background raster image URL. This image will fill the background of the document; useful for tracing purposes.
   * @property {"embed"|"ref"} [img_save="embed"] Defines whether included raster images should be saved as Data URIs when possible, or as URL references. Settable in the Document Properties dialog.
   * @property {boolean} [save_notice_done=false] Used to track alert status
   * @property {boolean} [export_notice_done=false] Used to track alert status
   * @todo `save_notice_done` and `export_notice_done` should be changed to flags rather than preferences
   */
  /**
   * @namespace {module:SVGEditor.Prefs} defaultPrefs
   * @memberof module:SVGEditor~
   * @implements {module:SVGEditor.Prefs}
   */
  // The iteration algorithm for defaultPrefs does not currently support array/objects
  defaultPrefs = /** @lends module:SVGEditor~defaultPrefs */ {
    // EDITOR OPTIONS (DIALOG)
    /**
     * Default to "en" if locale.js detection does not detect another language.
     */
    lang: "",
    /**
     * Will default to 's' if the window height is smaller than the minimum
     * height and 'm' otherwise.
     */
    iconsize: "",
    bkgd_color: "#FFF",
    bkgd_url: "",
    // DOCUMENT PROPERTIES (DIALOG)
    img_save: "embed",
    // ALERT NOTICES
    // Only shows in UI as far as alert notices, but useful to remember, so keeping as pref
    save_notice_done: false,
    export_notice_done: false
  },
  /**
   * @name module:SVGEditor~defaultExtensions
   * @type {string[]}
   */
  defaultExtensions = [
    // "ext-connector.js",
    "ext-markers.js",
    "ext-eyedropper.js",
    //"ext-grid.js",
    "ext-imagelib.js",
    "ext-overview_window.js",
    "ext-panning.js",
    "ext-polygon.js",
    "ext-star.js",
    "ext-storage.js"
  ],
  /**
   * @typedef {"@default"|string} module:SVGEditor.Stylesheet `@default` will automatically load all of the default CSS paths for SVGEditor
   */
  /**
   * @typedef {GenericArray} module:SVGEditor.XYDimensions
   * @property {Integer} length 2
   * @property {Float} 0
   * @property {Float} 1
   */
  /**
   * @tutorial ConfigOptions
   * @interface module:SVGEditor.Config
   * @property {string} [canvasName="default"] Used to namespace storage provided via `ext-storage.js`; you can use this if you wish to have multiple independent instances of SVG Edit on the same domain
   * @property {boolean} [no_save_warning=false] If `true`, prevents the warning dialog box from appearing when closing/reloading the page. Mostly useful for testing.
   * @property {string} [imgPath="images/"] The path where the SVG icons are located, with trailing slash. Note that as of version 2.7, this is not configurable by URL for security reasons.
   * @property {string} [langPath="locale/"] The path where the language files are located, with trailing slash. Default will be changed to `../dist/locale/` if this is a modular load. Note that as of version 2.7, this is not configurable by URL for security reasons.
   * @property {string} [extPath="extensions/"] The path used for extension files, with trailing slash. Default will be changed to `../dist/extensions/` if this is a modular load. Note that as of version 2.7, this is not configurable by URL for security reasons.
   * @property {string} [canvgPath="canvg/"] The path used for `canvg` files, with trailing slash. Default will be changed to `../dist/` if this is a modular load.
   * @property {string} [jspdfPath="jspdf/"] The path used for `jsPDF` files, with trailing slash. Default will be changed to `../dist/` if this is a modular load.
   * @property {string} [extIconsPath="extensions/"] The path used for extension icons, with trailing slash.
   * @property {string} [jGraduatePath="jgraduate/images/"] The path where jGraduate images are located. Note that as of version 2.7, this is not configurable by URL for security reasons.
   * @property {boolean} [preventAllURLConfig=false] Set to `true` to override the ability for URLs to set non-content configuration (including extension config). Must be set early, i.e., in `svgedit-config-iife.js`; extension loading is too late!
   * @property {boolean} [preventURLContentLoading=false] Set to `true` to override the ability for URLs to set URL-based SVG content. Must be set early, i.e., in `svgedit-config-iife.js`; extension loading is too late!
   * @property {boolean} [lockExtensions=false] Set to `true` to override the ability for URLs to set their own extensions; disallowed in URL setting. There is no need for this when `preventAllURLConfig` is used. Must be set early, i.e., in `svgedit-config-iife.js`; extension loading is too late!
   * @property {boolean} [noDefaultExtensions=false] If set to `true`, prohibits automatic inclusion of default extensions (though "extensions" can still be used to add back any desired default extensions along with any other extensions). This can only be meaningfully used in `svgedit-config-iife.js` or in the URL
   * @property {boolean} [noStorageOnLoad=false] Some interaction with `ext-storage.js`; prevent even the loading of previously saved local storage.
   * @property {boolean} [forceStorage=false] Some interaction with `ext-storage.js`; strongly discouraged from modification as it bypasses user privacy by preventing them from choosing whether to keep local storage or not (and may be required by law in some regions)
   * @property {boolean} [emptyStorageOnDecline=false] Used by `ext-storage.js`; empty any prior storage if the user declines to store
   * @property {boolean} [avoidClientSide=false] DEPRECATED (use `avoidClientSideDownload` instead); Used by `ext-server_opensave.js`; set to `true` if you wish to always save to server and not only as fallback when client support is lacking
   * @property {boolean} [avoidClientSideDownload=false] Used by `ext-server_opensave.js`; set to `true` if you wish to always save to server and not only as fallback when client support is lacking
   * @property {boolean} [avoidClientSideOpen=false] Used by `ext-server_opensave.js`; set to `true` if you wish to always open from the server and not only as fallback when FileReader client support is lacking
   * @property {string[]} [extensions=module:SVGEditor~defaultExtensions] Extensions to load on startup. Use an array in `setConfig` and comma separated file names in the URL. Extension names must begin with "ext-". Note that as of version 2.7, paths containing "/", "\", or ":", are disallowed for security reasons. Although previous versions of this list would entirely override the default list, as of version 2.7, the defaults will always be added to this explicit list unless the configuration `noDefaultExtensions` is included.
   * @property {module:SVGEditor.Stylesheet[]} [stylesheets=["@default"]] An array of required stylesheets to load in parallel; include the value `"@default"` within this array to ensure all default stylesheets are loaded.
   * @property {string[]} [allowedOrigins=[]] Used by `ext-xdomain-messaging.js` to indicate which origins are permitted for cross-domain messaging (e.g., between the embedded editor and main editor code). Besides explicit domains, one might add '*' to allow all domains (not recommended for privacy/data integrity of your user's content!), `window.location.origin` for allowing the same origin (should be safe if you trust all apps on your domain), 'null' to allow `file:///` URL usage
   * @property {null|PlainObject} [colorPickerCSS=null] Object of CSS properties mapped to values (for jQuery) to apply to the color picker. See {@link http://api.jquery.com/css/#css-properties}. A `null` value (the default) will cause the CSS to default to `left` with a position equal to that of the `fill_color` or `stroke_color` element minus 140, and a `bottom` equal to 40
   * @property {string} [paramurl] This was available via URL only. Allowed an un-encoded URL within the query string (use "url" or "source" with a data: URI instead)
   * @property {Float} [canvas_expansion=3] The minimum area visible outside the canvas, as a multiple of the image dimensions. The larger the number, the more one can scroll outside the canvas.
   * @property {PlainObject} [initFill] Init fill properties
   * @property {string} [initFill.color="FF0000"] The initial fill color. Must be a hex code string. Defaults to solid red.
   * @property {Float} [initFill.opacity=1] The initial fill opacity. Must be a number between 0 and 1
   * @property {PlainObject} [initStroke] Init stroke properties
   * @property {Float} [initStroke.width=5] The initial stroke width. Must be a positive number.
   * @property {string} [initStroke.color="000000"] The initial stroke color. Must be a hex code. Defaults to solid black.
   * @property {Float} [initStroke.opacity=1] The initial stroke opacity. Must be a number between 0 and 1.
   * @property {PlainObject} text Text style properties
   * @property {Float} [text.stroke_width=0] Text stroke width
   * @property {Float} [text.font_size=24] Text font size
   * @property {string} [text.font_family="serif"] Text font family
   * @property {Float} [initOpacity=1] Initial opacity (multiplied by 100)
   * @property {module:SVGEditor.XYDimensions} [dimensions=[640, 480]] The default width/height of a new document. Use an array in `setConfig` (e.g., `[800, 600]`) and comma separated numbers in the URL.
   * @property {boolean} [gridSnapping=false] Enable snap to grid by default. Set in Editor Options.
   * @property {string} [gridColor="#000"] Accepts hex, e.g., '#000'. Set in Editor Options. Defaults to black.
   * @property {string} [baseUnit="px"] Set in Editor Options.
   * @property {Float} [snappingStep=10] Set the default grid snapping value. Set in Editor Options.
   * @property {boolean} [showRulers=true] Initial state of ruler display (v2.6). Set in Editor Options.
   * @property {string} [initTool="select"] The initially selected tool. Must be either the ID of the button for the tool, or the ID without `tool_` prefix (e.g., "select").
   * @property {boolean} [wireframe=false] Start in wireframe mode
   * @property {boolean} [showlayers=false] Open the layers side-panel by default.
   * @property {"new"|"same"} [exportWindowType="new"] Can be "new" or "same" to indicate whether new windows will be generated for each export; the `window.name` of the export window is namespaced based on the `canvasName` (and incremented if "new" is selected as the type). Introduced 2.8.
   * @property {boolean} [showGrid=false] Set by `ext-grid.js`; determines whether or not to show the grid by default
   * @property {boolean} [show_outside_canvas=true] Defines whether or not elements outside the canvas should be visible. Set and used in `svgcanvas.js`.
   * @property {boolean} [selectNew=true] If true, will replace the selection with the current element and automatically select element objects (when not in "path" mode) after they are created, showing their grips (v2.6). Set and used in `svgcanvas.js` (`mouseUp`).
   * @todo Some others could be preferences as well (e.g., preventing URL changing of extensions, defaultExtensions, stylesheets, colorPickerCSS); Change the following to preferences and add pref controls where missing to the UI (e.g., `canvas_expansion`, `initFill`, `initStroke`, `text`, `initOpacity`, `dimensions`, `initTool`, `wireframe`, `showlayers`, `gridSnapping`, `gridColor`, `baseUnit`, `snappingStep`, `showRulers`, `exportWindowType`, `showGrid`, `show_outside_canvas`, `selectNew`)?
   */
  /**
   * @namespace {module:SVGEditor.Config} defaultConfig
   * @memberof module:SVGEditor~
   * @implements {module:SVGEditor.Config}
   */
  defaultConfig = {
    canvasName: "default",
    canvas_expansion: 3,
    initFill: {
      color: "AAD4FF", // solid red
      opacity: 1
    },
    initStroke: {
      width: 1,
      color: "000000", // solid black
      opacity: 1
    },
    text: {
      stroke_width: 0,
      font_size: 24,
      font_family: "serif"
    },
    initOpacity: 1,
    colorPickerCSS: null, // Defaults to 'left' with a position equal to that of the fill_color or stroke_color element minus 140, and a 'bottom' equal to 40
    initTool: "select",
    exportWindowType: "new", // 'same' (todo: also support 'download')
    wireframe: false,
    showlayers: false,
    no_save_warning: false,
    // PATH CONFIGURATION
    // The following path configuration items are disallowed in the URL (as should any future path configurations)
    langPath: "locale/", // Default will be changed if this is a non-modular load
    extPath: "extensions/", // Default will be changed if this is a non-modular load
    canvgPath: "canvg/", // Default will be changed if this is a non-modular load
    jspdfPath: "jspdf/", // Default will be changed if this is a non-modular load
    imgPath: "images/",
    jGraduatePath: "jgraduate/images/",
    extIconsPath: "extensions/",
    // DOCUMENT PROPERTIES
    // Change the following to a preference (already in the Document Properties dialog)?
    dimensions: [640, 480],
    // EDITOR OPTIONS
    // Change the following to preferences (already in the Editor Options dialog)?
    gridSnapping: false,
    gridColor: "#000",
    baseUnit: "px",
    snappingStep: 10,
    showRulers: true,
    // URL BEHAVIOR CONFIGURATION
    preventAllURLConfig: false,
    preventURLContentLoading: false,
    // EXTENSION CONFIGURATION (see also preventAllURLConfig)
    lockExtensions: false, // Disallowed in URL setting
    noDefaultExtensions: false, // noDefaultExtensions can only be meaningfully used in `svgedit-config-iife.js` or in the URL
    // EXTENSION-RELATED (GRID)
    showGrid: false, // Set by ext-grid.js
    // EXTENSION-RELATED (STORAGE)
    noStorageOnLoad: false, // Some interaction with ext-storage.js; prevent even the loading of previously saved local storage
    forceStorage: false, // Some interaction with ext-storage.js; strongly discouraged from modification as it bypasses user privacy by preventing them from choosing whether to keep local storage or not
    emptyStorageOnDecline: false, // Used by ext-storage.js; empty any prior storage if the user declines to store
    // EXTENSION (CLIENT VS. SERVER SAVING/OPENING)
    avoidClientSide: false, // Deprecated in favor of `avoidClientSideDownload`
    avoidClientSideDownload: false,
    avoidClientSideOpen: false
  },
  /**
   * LOCALE.
   * @name module:SVGEditor.uiStrings
   * @type {PlainObject}
   */
  uiStrings = (editor.uiStrings = {});

let svgCanvas,
  inputElements = [],
  currentInputIndex = -1,
  urldata = {},
  isReady = false,
  customExportImage = false,
  customExportPDF = false,
  curPrefs = {},
  // Note: The difference between Prefs and Config is that Prefs
  //   can be changed in the UI and are stored in the browser,
  //   while config cannot
  curConfig = {
    // We do not put on defaultConfig to simplify object copying
    //   procedures (we obtain instead from defaultExtensions)
    extensions: [],
    stylesheets: [],
    /**
     * Can use `location.origin` to indicate the current
     * origin. Can contain a '*' to allow all domains or 'null' (as
     * a string) to support all `file:///` URLs. Cannot be set by
     * URL for security reasons (not safe, at least for
     * privacy or data integrity of SVG content).
     * Might have been fairly safe to allow
     *   `new URL(location.href).origin` by default but
     *   avoiding it ensures some more security that even third
     *   party apps on the same domain also cannot communicate
     *   with this app by default.
     * For use with `ext-xdomain-messaging.js`
     * @todo We might instead make as a user-facing preference.
     */
    allowedOrigins: []
  };

/**
 *
 * @param {string} str SVG string
 * @param {PlainObject} [opts={}]
 * @param {boolean} [opts.noAlert]
 * @throws {Error} Upon failure to load SVG
 * @returns {Promise<void>} Resolves to undefined upon success (or if `noAlert` is
 *   falsey, though only until after the `alert` is closed); rejects if SVG
 *   loading fails and `noAlert` is truthy.
 */
async function loadSvgString(str, { noAlert } = {}) {
  const success = svgCanvas.setSvgString(str) !== false;
  if (success) {
    return;
  }

  if (!noAlert) {
    await $.alert(uiStrings.notification.errorLoadingSVG);
    return;
  }
  throw new Error("Error loading SVG");
}

/**
 * @function module:SVGEditor~getImportLocale
 * @param {PlainObject} defaults
 * @param {string} defaults.defaultLang
 * @param {string} defaults.defaultName
 * @returns {module:SVGEditor~ImportLocale}
 */
function getImportLocale({ defaultLang, defaultName }) {
  /**
   * @function module:SVGEditor~ImportLocale
   * @param {PlainObject} localeInfo
   * @param {string} [localeInfo.name] Defaults to `defaultName` of {@link module:SVGEditor~getImportLocale}
   * @param {string} [localeInfo.lang=defaultLang] Defaults to `defaultLang` of {@link module:SVGEditor~getImportLocale}
   * @returns {Promise<module:locale.LocaleStrings>} Resolves to {@link module:locale.LocaleStrings}
   */
  return async function importLocaleDefaulting({
    name = defaultName,
    lang = defaultLang
  } = {}) {
    /**
     *
     * @param {string} language
     * @returns {Promise<module:locale.LocaleStrings>} Resolves to {@link module:locale.LocaleStrings}
     */
    function importLocale(language) {
      const url = `${curConfig.extPath}ext-locale/${name}/${language}.js`;
      return importSetGlobalDefault(url, {
        global: `svgEditorExtensionLocale_${name}_${language.replace(
          /-/g,
          "_"
        )}`
      });
    }
    try {
      return await importLocale(lang);
    } catch (err) {
      return importLocale("en");
    }
  };
}

/**
 * EXPORTS.
 */

/**
 * Store and retrieve preferences.
 * @param {string} key The preference name to be retrieved or set
 * @param {string} [val] The value. If the value supplied is missing or falsey, no change to the preference will
 * be made unless `mayBeEmpty` is set.
 * @param {boolean} [mayBeEmpty] If value may be falsey.
 * @returns {string|void} If val is missing or falsey and `mayBeEmpty` is not set, the
 * value of the previously stored preference will be returned.
 * @todo Review whether any remaining existing direct references to
 *  getting `curPrefs` can be changed to use `svgEditor.pref()` getting to ensure
 *  `defaultPrefs` fallback (also for sake of `allowInitialUserOverride`);
 *  specifically, `bkgd_color` could be changed so that the pref dialog has a
 *  button to auto-calculate background, but otherwise uses `svgEditor.pref()` to
 *  be able to get default prefs or overridable settings
 */
editor.pref = function(key, val, mayBeEmpty) {
  if (mayBeEmpty || val) {
    curPrefs[key] = val;
    /**
     * @name curPrefs
     * @memberof module:SVGEditor
     * @implements {module:SVGEditor.Prefs}
     */
    editor.curPrefs = curPrefs; // Update exported value
    return undefined;
  }
  return key in curPrefs ? curPrefs[key] : defaultPrefs[key];
};

/*
* EDITOR PUBLIC METHODS
// Todo: Sort these methods per invocation order, ideally with init at the end
// Todo: Prevent execution until init executes if dependent on it?
*/
editor.putLocale = putLocale;
editor.readLang = readLang;
editor.setStrings = setStrings;

/**
 * Where permitted, sets canvas and/or `defaultPrefs` based on previous
 *  storage. This will override URL settings (for security reasons) but
 *  not `svgedit-config-iife.js` configuration (unless initial user
 *  overriding is explicitly permitted there via `allowInitialUserOverride`).
 * @todo Split `allowInitialUserOverride` into `allowOverrideByURL` and
 *  `allowOverrideByUserStorage` so `svgedit-config-iife.js` can disallow some
 *  individual items for URL setting but allow for user storage AND/OR
 *  change URL setting so that it always uses a different namespace,
 *  so it won't affect pre-existing user storage (but then if users saves
 *  that, it will then be subject to tampering
 * @returns {void}
 */
editor.loadContentAndPrefs = function() {
  if (
    !curConfig.forceStorage &&
    (curConfig.noStorageOnLoad ||
      !document.cookie.match(
        /(?:^|;\s*)svgeditstore=(?:prefsAndContent|prefsOnly)/
      ))
  ) {
    return;
  }

  // LOAD CONTENT
  if (
    editor.storage && // Cookies do not have enough available memory to hold large documents
    (curConfig.forceStorage ||
      (!curConfig.noStorageOnLoad &&
        document.cookie.match(/(?:^|;\s*)svgeditstore=prefsAndContent/)))
  ) {
    const name = "svgedit-" + curConfig.canvasName;
    const cached = editor.storage.getItem(name);
    if (cached) {
      editor.loadFromString(cached);
    }
  }

  // LOAD PREFS
  Object.keys(defaultPrefs).forEach(key => {
    const storeKey = "svg-edit-" + key;
    if (editor.storage) {
      const val = editor.storage.getItem(storeKey);
      if (val) {
        defaultPrefs[key] = String(val); // Convert to string for FF (.value fails in Webkit)
      }
    } else if (window.widget) {
      defaultPrefs[key] = window.widget.preferenceForKey(storeKey);
    } else {
      const result = document.cookie.match(
        new RegExp(
          "(?:^|;\\s*)" +
            Utils.regexEscape(encodeURIComponent(storeKey)) +
            "=([^;]+)"
        )
      );
      defaultPrefs[key] = result ? decodeURIComponent(result[1]) : "";
    }
  });
};

/**
 * Allows setting of preferences or configuration (including extensions).
 * @param {module:SVGEditor.Config|module:SVGEditor.Prefs} opts The preferences or configuration (including extensions). See the tutorial on {@tutorial ConfigOptions} for info on config and preferences.
 * @param {PlainObject} [cfgCfg] Describes configuration which applies to the
 *    particular batch of supplied options
 * @param {boolean} [cfgCfg.allowInitialUserOverride=false] Set to true if you wish
 *  to allow initial overriding of settings by the user via the URL
 *  (if permitted) or previously stored preferences (if permitted);
 *  note that it will be too late if you make such calls in extension
 *  code because the URL or preference storage settings will
 *   have already taken place.
 * @param {boolean} [cfgCfg.overwrite=true] Set to false if you wish to
 *  prevent the overwriting of prior-set preferences or configuration
 *  (URL settings will always follow this requirement for security
 *  reasons, so `svgedit-config-iife.js` settings cannot be overridden unless it
 *  explicitly permits via `allowInitialUserOverride` but extension config
 *  can be overridden as they will run after URL settings). Should
 *   not be needed in `svgedit-config-iife.js`.
 * @returns {void}
 */
editor.setConfig = function(opts, cfgCfg) {
  cfgCfg = cfgCfg || {};
  /**
   *
   * @param {module:SVGEditor.Config|module:SVGEditor.Prefs} cfgObj
   * @param {string} key
   * @param {any} val See {@link module:SVGEditor.Config} or {@link module:SVGEditor.Prefs}
   * @returns {void}
   */
  function extendOrAdd(cfgObj, key, val) {
    if (cfgObj[key] && typeof cfgObj[key] === "object") {
      $.extend(true, cfgObj[key], val);
    } else {
      cfgObj[key] = val;
    }
  }
  Object.entries(opts).forEach(function([key, val]) {
    // Only allow prefs defined in defaultPrefs or...
    if ({}.hasOwnProperty.call(defaultPrefs, key)) {
      if (
        cfgCfg.overwrite === false &&
        (curConfig.preventAllURLConfig || {}.hasOwnProperty.call(curPrefs, key))
      ) {
        return;
      }
      if (cfgCfg.allowInitialUserOverride === true) {
        defaultPrefs[key] = val;
      } else {
        editor.pref(key, val);
      }
    } else if (["extensions", "stylesheets", "allowedOrigins"].includes(key)) {
      if (
        cfgCfg.overwrite === false &&
        (curConfig.preventAllURLConfig ||
          ["allowedOrigins", "stylesheets"].includes(key) ||
          (key === "extensions" && curConfig.lockExtensions))
      ) {
        return;
      }
      curConfig[key] = curConfig[key].concat(val); // We will handle any dupes later
      // Only allow other curConfig if defined in defaultConfig
    } else if ({}.hasOwnProperty.call(defaultConfig, key)) {
      if (
        cfgCfg.overwrite === false &&
        (curConfig.preventAllURLConfig ||
          {}.hasOwnProperty.call(curConfig, key))
      ) {
        return;
      }
      // Potentially overwriting of previously set config
      if ({}.hasOwnProperty.call(curConfig, key)) {
        if (cfgCfg.overwrite === false) {
          return;
        }
        extendOrAdd(curConfig, key, val);
      } else if (cfgCfg.allowInitialUserOverride === true) {
        extendOrAdd(defaultConfig, key, val);
      } else if (defaultConfig[key] && typeof defaultConfig[key] === "object") {
        curConfig[key] = Array.isArray(defaultConfig[key]) ? [] : {};
        $.extend(true, curConfig[key], val); // Merge properties recursively, e.g., on initFill, initStroke objects
      } else {
        curConfig[key] = val;
      }
    }
  });
  /**
   * @name curConfig
   * @memberof module:SVGEditor
   * @implements {module:SVGEditor.Config}
   */
  editor.curConfig = curConfig; // Update exported value
};

/**
 * All methods are optional.
 * @interface module:SVGEditor.CustomHandler
 * @type {PlainObject}
 */
/**
 * Its responsibilities are:
 *  - invoke a file chooser dialog in 'open' mode
 *  - let user pick a SVG file
 *  - calls [svgCanvas.setSvgString()]{@link module:svgcanvas.SvgCanvas#setSvgString} with the string contents of that file.
 * Not passed any parameters.
 * @function module:SVGEditor.CustomHandler#open
 * @returns {void}
 */
/**
 * Its responsibilities are:
 *  - accept the string contents of the current document
 *  - invoke a file chooser dialog in 'save' mode
 *  - save the file to location chosen by the user.
 * @function module:SVGEditor.CustomHandler#save
 * @param {external:Window} win
 * @param {module:svgcanvas.SvgCanvas#event:saved} svgStr A string of the SVG
 * @listens module:svgcanvas.SvgCanvas#event:saved
 * @returns {void}
 */
/**
 * Its responsibilities (with regard to the object it is supplied in its 2nd argument) are:
 *  - inform user of any issues supplied via the "issues" property
 *  - convert the "svg" property SVG string into an image for export;
 *    utilize the properties "type" (currently 'PNG', 'JPEG', 'BMP',
 *    'WEBP', 'PDF'), "mimeType", and "quality" (for 'JPEG' and 'WEBP'
 *    types) to determine the proper output.
 * @function module:SVGEditor.CustomHandler#exportImage
 * @param {external:Window} win
 * @param {module:svgcanvas.SvgCanvas#event:exported} data
 * @listens module:svgcanvas.SvgCanvas#event:exported
 * @returns {void}
 */
/**
 * @function module:SVGEditor.CustomHandler#exportPDF
 * @param {external:Window} win
 * @param {module:svgcanvas.SvgCanvas#event:exportedPDF} data
 * @listens module:svgcanvas.SvgCanvas#event:exportedPDF
 * @returns {void}
 */

/**
 * Allows one to override default SVGEdit `open`, `save`, and
 * `export` editor behaviors.
 * @param {module:SVGEditor.CustomHandler} opts Extension mechanisms may call `setCustomHandlers` with three functions: `opts.open`, `opts.save`, and `opts.exportImage`
 * @returns {Promise<void>}
 */
editor.setCustomHandlers = function(opts) {
  return editor.ready(function() {
    if (opts.open) {
      $('#tool_open > input[type="file"]').remove();
      $("#tool_open").show();
      svgCanvas.open = opts.open;
    }
    if (opts.save) {
      editor.showSaveWarning = false;
      svgCanvas.bind("saved", opts.save);
    }
    if (opts.exportImage) {
      customExportImage = opts.exportImage;
      svgCanvas.bind("exported", customExportImage); // canvg and our RGBColor will be available to the method
    }
    if (opts.exportPDF) {
      customExportPDF = opts.exportPDF;
      svgCanvas.bind("exportedPDF", customExportPDF); // jsPDF and our RGBColor will be available to the method
    }
  });
};

/**
 * @param {boolean} arg
 * @returns {void}
 */
editor.randomizeIds = function(arg) {
  svgCanvas.randomizeIds(arg);
};

/**
 * Auto-run after a Promise microtask.
 * @returns {void}
 */
editor.init = function() {
  const modularVersion =
    !("svgEditor" in window) ||
    !window.svgEditor ||
    window.svgEditor.modules !== false;
  if (!modularVersion) {
    Object.assign(defaultConfig, {
      langPath: "../dist/locale/",
      extPath: "../dist/extensions/",
      canvgPath: "../dist/",
      jspdfPath: "../dist/"
    });
  }

  // const host = location.hostname,
  //  onWeb = host && host.includes('.');
  // Some FF versions throw security errors here when directly accessing
  try {
    if ("localStorage" in window) {
      // && onWeb removed so Webkit works locally
      /**
       * The built-in interface implemented by `localStorage`
       * @external Storage
       */
      /**
       * @name storage
       * @memberof module:SVGEditor
       * @type {external:Storage}
       */
      editor.storage = localStorage;
    }
  } catch (err) {}

  // Todo: Avoid const-defined functions and group functions together, etc. where possible
  const goodLangs = [];
  $("#lang_select option").each(function() {
    goodLangs.push(this.value);
  });

  /**
   * Sets up current preferences based on defaults.
   * @returns {void}
   */
  function setupCurPrefs() {
    curPrefs = $.extend(true, {}, defaultPrefs, curPrefs); // Now safe to merge with priority for curPrefs in the event any are already set
    // Export updated prefs
    editor.curPrefs = curPrefs;
  }

  /**
   * Sets up current config based on defaults.
   * @returns {void}
   */
  function setupCurConfig() {
    curConfig = $.extend(true, {}, defaultConfig, curConfig); // Now safe to merge with priority for curConfig in the event any are already set

    // Now deal with extensions and other array config
    if (!curConfig.noDefaultExtensions) {
      curConfig.extensions = curConfig.extensions.concat(defaultExtensions);
    }
    // ...and remove any dupes
    ["extensions", "stylesheets", "allowedOrigins"].forEach(function(cfg) {
      curConfig[cfg] = $.grep(curConfig[cfg], function(n, i) {
        // Supposedly faster than filter per http://amandeep1986.blogspot.hk/2015/02/jquery-grep-vs-js-filter.html
        return i === curConfig[cfg].indexOf(n);
      });
    });
    // Export updated config
    editor.curConfig = curConfig;
  }
  (() => {
    // Load config/data from URL if given
    const { search, searchParams } = new URL(location);

    if (search) {
      urldata = deparam(searchParams.toString(), true);

      ["initStroke", "initFill"].forEach(prop => {
        if (searchParams.has(`${prop}[color]`)) {
          // Restore back to original non-deparamed value to avoid color
          //  strings being converted to numbers
          urldata[prop].color = searchParams.get(`${prop}[color]`);
        }
      });

      if (searchParams.has("bkgd_color")) {
        urldata.bkgd_color = "#" + searchParams.get("bkgd_color");
      }

      if (urldata.dimensions) {
        urldata.dimensions = urldata.dimensions.split(",");
      }

      if (urldata.extensions) {
        // For security reasons, disallow cross-domain or cross-folder
        //  extensions via URL
        urldata.extensions = urldata.extensions.match(/[:/\\]/)
          ? ""
          : urldata.extensions.split(",");
      }

      // Disallowing extension paths via URL for
      // security reasons, even for same-domain
      // ones given potential to interact in undesirable
      // ways with other script resources
      [
        "langPath",
        "extPath",
        "canvgPath",
        "jspdfPath",
        "imgPath",
        "jGraduatePath",
        "extIconsPath"
      ].forEach(function(pathConfig) {
        if (urldata[pathConfig]) {
          delete urldata[pathConfig];
        }
      });

      // Note: `source` and `url` (as with `storagePrompt` later) are not
      //  set on config but are used below
      editor.setConfig(urldata, { overwrite: false });
      setupCurConfig();

      if (!curConfig.preventURLContentLoading) {
        let { source } = urldata;
        if (!source) {
          // urldata.source may have been null if it ended with '='
          const src = searchParams.get("source");
          if (src && src.startsWith("data:")) {
            source = src;
          }
        }
        if (source) {
          if (source.startsWith("data:")) {
            editor.loadFromDataURI(source);
          } else {
            editor.loadFromString(source);
          }
          return;
        }
        if (urldata.url) {
          editor.loadFromURL(urldata.url);
          return;
        }
      }
      if (!urldata.noStorageOnLoad || curConfig.forceStorage) {
        editor.loadContentAndPrefs();
      }
    } else {
      setupCurConfig();
      editor.loadContentAndPrefs();
    }
  })();
  setupCurPrefs();

  /**
   * Called internally.
   * @param {string|Element|external:jQuery} elem
   * @param {string|external:jQuery} iconId
   * @param {Float} forcedSize Not in use
   * @returns {void}
   */
  const setIcon = (editor.setIcon = function(elem, iconId, forcedSize) {
    let icon =
      typeof iconId === "string" ? $.getSvgIcon(iconId, true) : iconId.clone();
    if (!icon) {
      const iconEl = $(`#${iconId}`);
      if (iconEl.length > 0 && iconEl[0].tagName === "LI") {
        icon = iconEl.children().clone();
      }
    }
    $(elem)
      .empty()
      .append(icon);
  });

  const loadExt = async (editor, langParam, extname) => {
    const extName = extname.match(/^ext-(.+)\.js/);
    // const {extName} = extname.match(/^ext-(?<extName>.+)\.js/).groups;
    if (!extName) {
      // Ensure URL cannot specify some other unintended file in the extPath
      return undefined;
    }
    const url = curConfig.extPath + extname;
    // Todo: Replace this with `return import(url);` when
    //   `import()` widely supported
    /**
     * @tutorial ExtensionDocs
     * @typedef {PlainObject} module:SVGEditor.ExtensionObject
     * @property {string} [name] Name of the extension. Used internally; no need for i18n. Defaults to extension name without beginning "ext-" or ending ".js".
     * @property {module:svgcanvas.ExtensionInitCallback} [init]
     */
    try {
      /**
       * @type {module:SVGEditor.ExtensionObject}
       */
      const imported = await importSetGlobalDefault(url, {
        global: "svgEditorExtension_" + extName[1].replace(/-/g, "_")
        // global: 'svgEditorExtension_' + extName.replace(/-/g, '_')
      });
      const { name = extName[1], init } = imported;
      // const {name = extName, init} = imported;
      const importLocale = getImportLocale({
        defaultLang: langParam,
        defaultName: name
      });
      return editor.addExtension(name, init && init.bind(editor), {
        $,
        importLocale
      });
    } catch (err) {
      // Todo: Add config to alert any errors
      console.log(err); // eslint-disable-line no-console
      console.error("Extension failed to load: " + extname + "; " + err); // eslint-disable-line no-console
      return undefined;
    }
  };

  /**
   * @fires module:svgcanvas.SvgCanvas#event:ext_addLangData
   * @fires module:svgcanvas.SvgCanvas#event:ext_langReady
   * @fires module:svgcanvas.SvgCanvas#event:ext_langChanged
   * @fires module:svgcanvas.SvgCanvas#event:extensions_added
   * @returns {Promise<module:locale.LangAndData>} Resolves to result of {@link module:locale.readLang}
   */
  const extAndLocaleFunc = async function() {
    // const lang = ('lang' in curPrefs) ? curPrefs.lang : null;
    const { langParam, langData } = await editor.putLocale(
      editor.pref("lang"),
      goodLangs,
      curConfig
    );
    await setLang(langParam, langData);

    const { ok, cancel } = uiStrings.common;
    jQueryPluginDBox($, { ok, cancel });

    try {
      await initUI();
      for (const extname of curConfig.extensions) {
        const res = await loadExt(editor, langParam, extname);
      }
    } catch (err) {
      console.log(`Error loading ext: ${err}`);
    }

    svgCanvas.bind(
      "extensions_added",
      /**
       * @param {external:Window} win
       * @param {module:svgcanvas.SvgCanvas#event:extensions_added} data
       * @listens module:svgcanvas.SvgCanvas#event:extensions_added
       * @returns {void}
       */
      (win, data) => {
        extensionsAdded = true;
        Actions.setAll();

        if (editor.storagePromptState === "ignore") {
          updateCanvas(true);
        }

        messageQueue.forEach(
          /**
           * @param {module:svgcanvas.SvgCanvas#event:message} messageObj
           * @fires module:svgcanvas.SvgCanvas#event:message
           * @returns {void}
           */
          messageObj => {
            svgCanvas.call("message", messageObj);
          }
        );

        clickSelect();
      }
    );
    svgCanvas.call("extensions_added");
  };

  const stateObj = { tool_scale: editor.tool_scale };

  /**
   *
   * @returns {void}
   */

  /**
   * @type {string}
   */
  const uaPrefix = (function() {
    const regex = /^(?:Moz|Webkit|Khtml|O|ms|Icab)(?=[A-Z])/;
    const someScript = document.getElementsByTagName("script")[0];
    for (const prop in someScript.style) {
      if (regex.test(prop)) {
        // test is faster than match, so it's better to perform
        // that on the lot and match only when necessary
        return prop.match(regex)[0];
      }
    }
    // Nothing found so far?
    if ("WebkitOpacity" in someScript.style) {
      return "Webkit";
    }
    if ("KhtmlOpacity" in someScript.style) {
      return "Khtml";
    }

    return "";
  })();

  /**
   * @param {external:jQuery} elems
   * @param {Float} scale
   * @returns {void}
   */
  const scaleElements = function(elems, scale) {
    // const prefix = '-' + uaPrefix.toLowerCase() + '-'; // Currently unused
    const sides = ["top", "left", "bottom", "right"];

    elems.each(function() {
      // Handled in CSS
      // this.style[uaPrefix + 'Transform'] = 'scale(' + scale + ')';
      const el = $(this);
      const w = el.outerWidth() * (scale - 1);
      const h = el.outerHeight() * (scale - 1);
      // const margins = {}; // Currently unused

      for (let i = 0; i < 4; i++) {
        const s = sides[i];
        let cur = el.data("orig_margin-" + s);
        if (Utils.isNullish(cur)) {
          cur = parseInt(el.css("margin-" + s));
          // Cache the original margin
          el.data("orig_margin-" + s, cur);
        }
        let val = cur * scale;
        if (s === "right") {
          val += w;
        } else if (s === "bottom") {
          val += h;
        }

        el.css("margin-" + s, val);
        // el.css('outline', '1px solid red');
      }
    });
  };

  /**
   * Called internally.
   * @param {module:SVGEditor.IconSize} size
   * @returns {void}
   */
  const setIconSize = (editor.setIconSize = function(size) {
    // const elems = $('.tool_button, .push_button, .tool_button_current, .disabled, .icon_label, #url_notice, #tool_open');
    const selToscale =
      "#tools_top .toolset, #editor_panel > *, #history_panel > *," +
      "        #main_button, #tools_left > *, #path_node_panel > *, #multiselected_panel > *," +
      "        #g_panel > *, #tool_font_size > *, .tools_flyout";

    const elems = $(selToscale);

    let scale = 1;
    if (typeof size === "number") {
      scale = size;
    } else {
      const iconSizes = { s: 0.75, m: 1, l: 1.25, xl: 1.5 };
      scale = iconSizes[size];
    }

    stateObj.tool_scale = editor.tool_scale = scale;

    const hiddenPs = elems.parents(":hidden");
    hiddenPs.css("visibility", "hidden").show();
    scaleElements(elems, scale);
    hiddenPs.css("visibility", "visible").hide();
    // return;

    editor.pref("iconsize", size);
    $("#iconsize").val(size);

    // Note that all rules will be prefixed with '#svg_editor' when parsed
    const cssResizeRules = {
      "#tools_top": {
        left: 50 + $("#main_button").width(),
        height: 72
      },
      "#tools_left": {
        width: 31,
        top: 74
      },
      "div#workarea": {
        left: 38,
        top: 74
      }
      // '#tools_bottom': {
      //   left: {s: '27px', l: '46px', xl: '65px'},
      //   height: {s: '58px', l: '98px', xl: '145px'}
      // },
      // '#color_tools': {
      //   'border-spacing': {s: '0 1px'},
      //   'margin-top': {s: '-1px'}
      // },
      // '#color_tools .icon_label': {
      //   width: {l:'43px', xl: '60px'}
      // },
      // '.color_tool': {
      //   height: {s: '20px'}
      // },
      // '#tool_opacity': {
      //   top: {s: '1px'},
      //   height: {s: 'auto', l:'auto', xl:'auto'}
      // },
      // '#tools_top input, #tools_bottom input': {
      //   'margin-top': {s: '2px', l: '4px', xl: '5px'},
      //   height: {s: 'auto', l: 'auto', xl: 'auto'},
      //   border: {s: '1px solid #555', l: 'auto', xl: 'auto'},
      //   'font-size': {s: '.9em', l: '1.2em', xl: '1.4em'}
      // },
      // '#zoom_panel': {
      //   'margin-top': {s: '3px', l: '4px', xl: '5px'}
      // },
      // '#copyright, #tools_bottom .label': {
      //   'font-size': {l: '1.5em', xl: '2em'},
      //   'line-height': {s: '15px'}
      // },
      // '#tools_bottom_2': {
      //   width: {l: '295px', xl: '355px'},
      //   top: {s: '4px'}
      // },
      // '#tools_top > div, #tools_top': {
      //   'line-height': {s: '17px', l: '34px', xl: '50px'}
      // },
      // '.dropdown button': {
      //   height: {s: '18px', l: '34px', xl: '40px'},
      //   'line-height': {s: '18px', l: '34px', xl: '40px'},
      //   'margin-top': {s: '3px'}
      // },
      // '#tools_top label, #tools_bottom label': {
      //   'font-size': {s: '1em', l: '1.5em', xl: '2em'},
      //   height: {s: '25px', l: '42px', xl: '64px'}
      // },
      // 'div.toolset': {
      //   height: {s: '25px', l: '42px', xl: '64px'}
      // },
      // '#tool_bold, #tool_italic': {
      //   'font-size': {s: '1.5em', l: '3em', xl: '4.5em'}
      // },
      // '#sidepanels': {
      //   top: {s: '50px', l: '88px', xl: '125px'},
      //   bottom: {s: '51px', l: '68px', xl: '65px'}
      // },
      // '#layerbuttons': {
      //   width: {l: '130px', xl: '175px'},
      //   height: {l: '24px', xl: '30px'}
      // },
      // '#layerlist': {
      //   width: {l: '128px', xl: '150px'}
      // },
      // '.layer_button': {
      //   width: {l: '19px', xl: '28px'},
      //   height: {l: '19px', xl: '28px'}
      // },
      // 'input.spin-button': {
      //   'background-image': {l: 'url('images/spinbtn_updn_big.png')', xl: 'url('images/spinbtn_updn_big.png')'},
      //   'background-position': {l: '100% -5px', xl: '100% -2px'},
      //   'padding-right': {l: '24px', xl: '24px' }
      // },
      // 'input.spin-button.up': {
      //   'background-position': {l: '100% -45px', xl: '100% -42px'}
      // },
      // 'input.spin-button.down': {
      //   'background-position': {l: '100% -85px', xl: '100% -82px'}
      // },
      // '#position_opts': {
      //   width: {all: (size_num*4) +'px'}
      // }
    };

    let ruleElem = $("#tool_size_rules");
    if (!ruleElem.length) {
      ruleElem = $('<style id="tool_size_rules"></style>').appendTo("head");
    } else {
      ruleElem.empty();
    }

    if (size !== "m") {
      let styleStr = "";
      $.each(cssResizeRules, function(selector, rules) {
        selector = "#svg_editor " + selector.replace(/,/g, ", #svg_editor");
        styleStr += selector + "{";
        $.each(rules, function(prop, values) {
          let val;
          if (typeof values === "number") {
            val = values * scale + "px";
          } else if (values[size] || values.all) {
            val = values[size] || values.all;
          }
          styleStr += prop + ":" + val + ";";
        });
        styleStr += "}";
      });
      // this.style[uaPrefix + 'Transform'] = 'scale(' + scale + ')';
      const prefix = "-" + uaPrefix.toLowerCase() + "-";
      styleStr +=
        selToscale +
        "{" +
        prefix +
        "transform: scale(" +
        scale +
        ");}" +
        " #svg_editor div.toolset .toolset {" +
        prefix +
        "transform: scale(1); margin: 1px !important;}" + // Hack for markers
        " #svg_editor .ui-slider {" +
        prefix +
        "transform: scale(" +
        1 / scale +
        ");}"; // Hack for sliders
      ruleElem.text(styleStr);
    }
  });

  /**
   * Setup SVG icons.
   * @returns {void}
   */
  async function initUI() {
    //editor.setIconSize("m");

    /**
     * Since stylesheets may be added out of order, we indicate the desired order
     *   for defaults and others after them (in an indeterminate order).
     * @param {string} stylesheetFile
     * @returns {Integer|PositiveInfinity}
     */
    function getStylesheetPriority(stylesheetFile) {
      switch (stylesheetFile) {
        case "jgraduate/css/jPicker.css":
          return 1;
        case "jgraduate/css/jGraduate.css":
          return 2;
        case "svg-editor.css":
          return 3;
        case "spinbtn/jQuery.SpinButton.css":
          return 4;
        default:
          return Infinity;
      }
    }
    let stylesheets = $.loadingStylesheets.sort((a, b) => {
      const priorityA = getStylesheetPriority(a);
      const priorityB = getStylesheetPriority(b);
      if (priorityA === priorityB) {
        return 0;
      }
      return priorityA > priorityB;
    });
    if (curConfig.stylesheets.length) {
      // Ensure a copy with unique items
      stylesheets = [...new Set(curConfig.stylesheets)];
      const idx = stylesheets.indexOf("@default");
      if (idx > -1) {
        stylesheets.splice(idx, 1, ...$.loadingStylesheets);
      }
    }
    await loadStylesheets(stylesheets, {
      acceptErrors({ stylesheetURL, reject, resolve }) {
        if ($.loadingStylesheets.includes(stylesheetURL)) {
          reject(new Error(`Missing expected stylesheet: ${stylesheetURL}`));
          return;
        }
        resolve();
      }
    });
    $("#svg_container")[0].style.visibility = "visible";
    await editor.runCallbacks();
  }
  /**
   * @name module:SVGEditor.canvas
   * @type {module:svgcanvas.SvgCanvas}
   */
  editor.canvas = svgCanvas = new SvgCanvas(
    document.getElementById("svgcanvas"),
    curConfig
  );
  const palette = [
      // Todo: Make into configuration item?
      "#000000",
      "#3f3f3f",
      "#7f7f7f",
      "#bfbfbf",
      "#ffffff",
      "#ff0000",
      "#ff7f00",
      "#ffff00",
      "#7fff00",
      "#00ff00",
      "#00ff7f",
      "#00ffff",
      "#007fff",
      "#0000ff",
      "#7f00ff",
      "#ff00ff",
      "#ff007f",
      "#7f0000",
      "#7f3f00",
      "#7f7f00",
      "#3f7f00",
      "#007f00",
      "#007f3f",
      "#007f7f",
      "#003f7f",
      "#00007f",
      "#3f007f",
      "#7f007f",
      "#7f003f",
      "#ffaaaa",
      "#ffd4aa",
      "#ffffaa",
      "#d4ffaa",
      "#aaffaa",
      "#aaffd4",
      "#aaffff",
      "#aad4ff",
      "#aaaaff",
      "#d4aaff",
      "#ffaaff",
      "#ffaad4"
    ],
    modKey = isMac() ? "meta+" : "ctrl+", // ⌘
    path = svgCanvas.pathActions,
    { undoMgr } = svgCanvas,
    workarea = $("#workarea"),
    canvMenu = $("#cmenu_canvas"),
    // layerMenu = $('#cmenu_layers'), // Unused
    paintBox = { fill: null, stroke: null };

  let resizeTimer, curScrollPos;
  let exportWindow = null,
    defaultImageURL = curConfig.imgPath + "image.png",
    zoomInIcon = "crosshair",
    zoomOutIcon = "crosshair",
    uiContext = "toolbars";

  // For external openers
  (function() {
    // let the opener know SVG Edit is ready (now that config is set up)
    const w = window.opener || window.parent;
    if (w) {
      try {
        /**
         * Triggered on a containing `document` (of `window.opener`
         * or `window.parent`) when the editor is loaded.
         * @event module:SVGEditor#event:svgEditorReadyEvent
         * @type {Event}
         * @property {true} bubbles
         * @property {true} cancelable
         */
        /**
         * @name module:SVGEditor.svgEditorReadyEvent
         * @type {module:SVGEditor#event:svgEditorReadyEvent}
         */
        const svgEditorReadyEvent = new w.CustomEvent("svgEditorReady", {
          bubbles: true,
          cancelable: true
        });
        w.document.documentElement.dispatchEvent(svgEditorReadyEvent);
      } catch (e) {}
    }
  })();

  /**
   *
   * @returns {void}
   */
  const setSelectMode = function() {
    const curr = $(".tool_button_current");
    if (curr.length && curr[0].id !== "tool_select") {
      curr.removeClass("tool_button_current").addClass("tool_button");
      $("#tool_select")
        .addClass("tool_button_current")
        .removeClass("tool_button");
    }
    svgCanvas.setMode("select");
  };

  // used to make the flyouts stay on the screen longer the very first time
  // const flyoutspeed = 1250; // Currently unused
  // let textBeingEntered = false; // Currently unused
  const origTitle = $("title:first").text();
  // Make [1,2,5] array
  const rIntervals = [];
  for (let i = 0.1; i < 1e5; i *= 10) {
    rIntervals.push(i);
    rIntervals.push(2 * i);
    rIntervals.push(5 * i);
  }

  /**
   * This function highlights the layer passed in (by fading out the other layers).
   * If no layer is passed in, this function restores the other layers.
   * @param {string} [layerNameToHighlight]
   * @returns {void}
   */
  const toggleHighlightLayer = function(layerNameToHighlight) {
    let i;
    const curNames = [],
      numLayers = svgCanvas.getCurrentDrawing().getNumLayers();
    for (i = 0; i < numLayers; i++) {
      curNames[i] = svgCanvas.getCurrentDrawing().getLayerName(i);
    }

    if (layerNameToHighlight) {
      curNames.forEach(curName => {
        if (curName !== layerNameToHighlight) {
          svgCanvas.getCurrentDrawing().setLayerOpacity(curName, 0.2);
        }
      });
    } else {
      curNames.forEach(curName => {
        svgCanvas.getCurrentDrawing().setLayerOpacity(curName, 1.0);
      });
    }
  };

  const getNodeInfo = function(svgNode) {
    const tagName = svgNode.dataset.as ? svgNode.dataset.as : svgNode.tagName;

    const map = {
      a: { text: "Link", icon: "group-4" },
      circle: { text: "Circle", icon: "ellipse" },
      ellipse: { text: "Ellipse", icon: "ellipse" },
      foreignObject: { text: "Foreign object", icon: "clip-content" },
      g: { text: "Group", icon: "group" },
      image: { text: "Image", icon: "upload-image-icon" },
      line: { text: "Line", icon: "line" },
      path: { text: "Path", icon: "pen" },
      polygon: { text: "Polygon", icon: "polygon" },
      polyline: { text: "Polyline", icon: "line" },
      rect: { text: "Rectangle", icon: "rectangle" },
      text: { text: "Text", icon: "textbox" },
      use: { text: "Symbol", icon: "symbolinstance" },
      input: {text: "Input", icon: "input"}
    };

    return map[tagName];
  };

  const updateSelectedLayerElements = function() {
    const elems = svgCanvas.getSelectedElems();
    $("#elemlist")
      .find(".g-selected")
      .removeClass("g-selected");
    for (const elem of elems) {
      $(`#elem_${elem.id}`).addClass("g-selected");
    }
  };

  const populateElements = function() {
    inputElements = [];
    const drawing = svgCanvas.getCurrentDrawing();
    const currentLayer = drawing.getCurrentLayer();
    const elementList = $("#elemlist").empty();
    const selectedElements = svgCanvas.getSelectedElems();

    let element = currentLayer.childNodes.length;

    while (element > 1) {
      element--;
      const node = currentLayer.childNodes.item(element);
      const info = getNodeInfo(node);
      const isSelected = selectedElements.includes(node);

      if (info.text === "Input") {
        inputElements.unshift(node);
      }

      if (info) {
        const rowTemplate = `<div id="elem_${node.id}" class="layer-row ${
          isSelected ? "g-selected" : ""
        }">
    <span class="layer-title-group" style="padding-left: 15px">
      <span class="layer-icon gravit-icon-${
        info.icon
      }" style="opacity: initial;"></span>
      <span class="layer-title">${info.text}</span>
    </span>
   </div>`;

        $(rowTemplate).appendTo(elementList);
      }
    }

    $("#elemlist .layer-row")
      .mouseover(function() {
        svgCanvas.addOverlayShape(this.id.substr("elem_".length));
      })
      .mouseout(function() {
        svgCanvas.removeOverlayShape(this.id.substr("elem_".length));
      })
      .click(function(e) {
        const elemId = this.id.substr("elem_".length);
        const elem = $(`#${elemId}`)[0];
        if (e.ctrlKey) {
          if ($(this).hasClass("g-selected")) {
            svgCanvas.removeFromSelection([elem]);
          } else {
            svgCanvas.addToSelection([elem]);
          }
        } else if (e.shiftKey) {
          const index = $("#elemlist .layer-row").index(this);
          const firstSelectIndex = $("#elemlist .layer-row.g-selected")
            .first()
            .index();

          let minIndex = index;
          let maxIndex = firstSelectIndex;

          if (index > firstSelectIndex) {
            minIndex = firstSelectIndex;
            maxIndex = index;
          }

          const selection = [];
          $("#elemlist .layer-row").each(function(i) {
            if (i >= minIndex && i <= maxIndex) {
              const elem = $(`#${this.id.substr("elem_".length)}`)[0];
              selection.push(elem);
            }
          });

          svgCanvas.clearSelection();
          svgCanvas.addToSelection(selection);
        } else {
          svgCanvas.clearSelection();
          svgCanvas.addToSelection([elem]);
        }
      });
  };

  const populateLayers = function() {
    svgCanvas.clearSelection();
    const layerlist = $("#layerlist").empty();
    const drawing = svgCanvas.getCurrentDrawing();
    const currentLayerName = drawing.getCurrentLayerName();
    let layer = svgCanvas.getCurrentDrawing().getNumLayers();
    // we get the layers in the reverse z-order (the layer rendered on top is listed first)
    while (layer--) {
      const name = drawing.getLayerName(layer);
      const isSelected = name === currentLayerName;
      const isVisible = drawing.getLayerVisibility(name);

      const rowTemplate = `<div class="layer-row ${
        isSelected ? "g-selected" : ""
      }" draggable="false"><span class="layer-arrow gravit-icon-right"></span> <span class="layer-title-group"> <span class="layer-icon" style="opacity: initial;" ></span> <span class="layer-title">${name}</span> </span><span style="margin-right: 7px" class="layer-action layer-visibility ${
        isVisible ? "gravit-icon-display" : "gravit-icon-hide"
      } g-active" data-title="Alternar visibilidad" ></span> </div>`;

      $(rowTemplate).appendTo(layerlist);
    }

    // handle selection of layer
    $("#layerlist .layer-row")
      .mouseup(function(evt) {
        $("#layerlist .layer-row").removeClass("g-selected");
        $(this).addClass("g-selected");
        svgCanvas.setCurrentLayer(this.textContent.trim());
        populateElements();
        evt.preventDefault();
      })
      .mouseover(function() {
        toggleHighlightLayer(this.textContent.trim());
      })
      .mouseout(function() {
        toggleHighlightLayer();
      })
      .dblclick(function() {
        layerRename();
      });
    $("#layerlist .layer-visibility").mouseup(function(e) {
      e.stopPropagation();
      const name = $(this)
        .parent()
        .text()
        .trim();

      const vis = $(this).hasClass("gravit-icon-display");
      svgCanvas.setLayerVisibility(name, !vis);
      $(this).removeClass(vis ? "gravit-icon-display" : "gravit-icon-hide");
      $(this).addClass(vis ? "gravit-icon-hide" : "gravit-icon-display");
    });

    populateElements();
  };

  let editingsource = false;
  /**
   *
   * @returns {void}
   */
  let origSource = "";

  /**
   * @param {Event} [e] Not used.
   * @param {boolean} forSaving
   * @returns {void}
   */
  const showSourceEditor = function(e, forSaving) {
    if (editingsource) {
      return;
    }

    editingsource = true;
    origSource = svgCanvas.getSvgString();
    $("#save_output_btns").toggle(Boolean(forSaving));
    $("#tool_source_back").toggle(!forSaving);
    $("#svg_source_textarea").val(origSource);
    $("#svg_source_editor").fadeIn();
    $("#svg_source_textarea").focus();
  };

  let selectedElement = null;
  let multiselected = false;

  /**
   * @param {boolean} editmode
   * @param {module:svgcanvas.SvgCanvas#event:selected} elems
   * @returns {void}
   */
  const togglePathEditMode = function(editmode, elems) {
    $("#path_node_panel").toggle(editmode);
    $("#tools_bottom_2,#tools_bottom_3").toggle(!editmode);
    if (editmode) {
      // Change select icon
      $(".tool_button_current")
        .removeClass("tool_button_current")
        .addClass("tool_button");
      $("#tool_select")
        .addClass("tool_button_current")
        .removeClass("tool_button");
      multiselected = false;
      if (elems.length) {
        selectedElement = elems[0];
      }
    }
  };

  /**
   * @type {module:svgcanvas.EventHandler}
   * @param {external:Window} wind
   * @param {module:svgcanvas.SvgCanvas#event:saved} svg The SVG source
   * @listens module:svgcanvas.SvgCanvas#event:saved
   * @returns {void}
   */
  const saveHandler = function(wind, svg) {
    editor.showSaveWarning = false;

    // by default, we add the XML prolog back, systems integrating SVG-edit (wikis, CMSs)
    // can just provide their own custom save handler and might not want the XML prolog
    svg = '<?xml version="1.0"?>\n' + svg;

    // IE9 doesn't allow standalone Data URLs
    // https://connect.microsoft.com/IE/feedback/details/542600/data-uri-images-fail-when-loaded-by-themselves
    if (isIE()) {
      showSourceEditor(0, true);
      return;
    }

    // Since saving SVGs by opening a new window was removed in Chrome use artificial link-click
    // https://stackoverflow.com/questions/45603201/window-is-not-allowed-to-navigate-top-frame-navigations-to-data-urls
    const a = document.createElement("a");
    a.href = "data:image/svg+xml;base64," + Utils.encode64(svg);
    a.download = "icon.svg";
    a.style.display = "none";
    document.body.append(a); // Need to append for Firefox

    a.click();

    // Alert will only appear the first time saved OR the
    //   first time the bug is encountered
    let done = editor.pref("save_notice_done");

    if (done !== "all") {
      let note = uiStrings.notification.saveFromBrowser.replace("%s", "SVG");
      // Check if FF and has <defs/>
      if (isGecko()) {
        if (svg.includes("<defs")) {
          // warning about Mozilla bug #308590 when applicable (seems to be fixed now in Feb 2013)
          note += "\n\n" + uiStrings.notification.defsFailOnSave;
          editor.pref("save_notice_done", "all");
          done = "all";
        } else {
          editor.pref("save_notice_done", "part");
        }
      } else {
        editor.pref("save_notice_done", "all");
      }
      if (done !== "part") {
        $.alert(note);
      }
    }
  };

  /**
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:exported} data
   * @listens module:svgcanvas.SvgCanvas#event:exported
   * @returns {void}
   */
  const exportHandler = function(win, data) {
    const { issues, exportWindowName } = data;

    exportWindow = window.open(
      Utils.blankPageObjectURL || "",
      exportWindowName
    ); // A hack to get the window via JSON-able name without opening a new one

    if (!exportWindow || exportWindow.closed) {
      /* await */ $.alert(uiStrings.notification.popupWindowBlocked);
      return;
    }

    exportWindow.location.href = data.bloburl || data.datauri;
    const done = editor.pref("export_notice_done");
    if (done !== "all") {
      let note = uiStrings.notification.saveFromBrowser.replace(
        "%s",
        data.type
      );

      // Check if there are issues
      if (issues.length) {
        const pre = "\n \u2022 ";
        note +=
          "\n\n" +
          uiStrings.notification.noteTheseIssues +
          pre +
          issues.join(pre);
      }

      // Note that this will also prevent the notice even though new issues may appear later.
      // May want to find a way to deal with that without annoying the user
      editor.pref("export_notice_done", "all");
      exportWindow.alert(note);
    }
  };

  /**
   *
   * @returns {void}
   */
  const operaRepaint = function() {
    // Repaints canvas in Opera. Needed for stroke-dasharray change as well as fill change
    if (!window.opera) {
      return;
    }
    $("<p/>")
      .hide()
      .appendTo("body")
      .remove();
  };

  /**
   *
   * @param {Element} opt
   * @param {boolean} changeElem
   * @returns {void}
   */
  function setStrokeOpt(opt, changeElem) {
    const { id } = opt;
    const bits = id.split("_");
    const [pre, val] = bits;

    if (changeElem) {
      svgCanvas.setStrokeAttr("stroke-" + pre, val);
    }
    operaRepaint();
    setIcon("#cur_" + pre, id, 20);
    $(opt)
      .addClass("current")
      .siblings()
      .removeClass("current");
  }

  /**
   * This is a common function used when a tool has been clicked (chosen).
   * It does several common things:
   * - Removes the `tool_button_current` class from whatever tool currently has it.
   * - Hides any flyouts.
   * - Adds the `tool_button_current` class to the button passed in.
   * @function module:SVGEDitor.toolButtonClick
   * @param {string|Element} button The DOM element or string selector representing the toolbar button
   * @param {boolean} noHiding Whether not to hide any flyouts
   * @returns {boolean} Whether the button was disabled or not
   */
  const toolButtonClick = (editor.toolButtonClick = function(button, noHiding) {
    if ($(button).hasClass("disabled")) {
      return false;
    }

    $("#styleoverrides").text("");

    $(".tool_button_current")
      .removeClass("tool_button_current")
      .addClass("tool_button");
    $(button)
      .addClass("tool_button_current")
      .removeClass("tool_button");

    return true;
  });

  /**
   * Unless the select toolbar button is disabled, sets the button
   * and sets the select mode and cursor styles.
   * @function module:SVGEditor.clickSelect
   * @returns {void}
   */
  const clickSelect = (editor.clickSelect = function() {
    if (toolButtonClick("#tool_select")) {
      svgCanvas.setMode("select");
    }
  });

  /**
   * Set a selected image's URL.
   * @function module:SVGEditor.setImageURL
   * @param {string} url
   * @returns {void}
   */
  const setImageURL = (editor.setImageURL = function(url) {
    if (!url) {
      url = defaultImageURL;
    }
    svgCanvas.setImageURL(url);
    $("#image_url").val(url);

    if (url.startsWith("data:")) {
      // data URI found
      $("#image_url").hide();
      $("#change_image_url").show();
    } else {
      // regular URL
      svgCanvas.embedImage(url, function(dataURI) {
        // Couldn't embed, so show warning
        $("#url_notice").toggle(!dataURI);
        defaultImageURL = url;
      });
      $("#image_url").show();
      $("#change_image_url").hide();
    }
  });

  /**
   *
   * @param {string} color
   * @param {string} url
   * @returns {void}
   */
  function setBackground(color, url) {
    // if (color == editor.pref('bkgd_color') && url == editor.pref('bkgd_url')) { return; }
    editor.pref("bkgd_color", color);
    editor.pref("bkgd_url", url, true);

    // This should be done in svgcanvas.js for the borderRect fill
    svgCanvas.setBackground(color, url);
  }

  /**
   * @param {PlainObject} [opts={}]
   * @param {boolean} [opts.cancelDeletes=false}]
   * @returns {Promise<void>} Resolves to `undefined`
   */
  async function promptImgURL({ cancelDeletes = false } = {}) {
    let curhref = svgCanvas.getHref(selectedElement);
    curhref = curhref.startsWith("data:") ? "" : curhref;
    const url = await $.prompt(uiStrings.notification.enterNewImgURL, curhref);
    if (url) {
      setImageURL(url);
    } else if (cancelDeletes) {
      svgCanvas.deleteSelectedElements();
    }
  }

  /**
   * @param {Element} elem
   * @returns {void}
   */
  const setInputWidth = function(elem) {
    const w = Math.min(Math.max(12 + elem.value.length * 6, 50), 300);
    $(elem).width(w);
  };

  /**
   *
   * @param {HTMLDivElement} [scanvas]
   * @param {Float} [zoom]
   * @returns {void}
   */
  function updateRulers(scanvas, zoom) {
    if (!zoom) {
      zoom = svgCanvas.getZoom();
    }
    if (!scanvas) {
      scanvas = $("#svgcanvas");
    }

    let d, i;
    const limit = 30000;
    const contentElem = svgCanvas.getContentElem();
    const units = getTypeMap();
    const unit = units[curConfig.baseUnit]; // 1 = 1px

    // draw x ruler then y ruler
    for (d = 0; d < 2; d++) {
      const isX = d === 0;
      const dim = isX ? "x" : "y";
      const lentype = isX ? "width" : "height";
      const contentDim = Number(contentElem.getAttribute(dim));

      const $hcanvOrig = $("#ruler_" + dim + " canvas:first");

      // Bit of a hack to fully clear the canvas in Safari & IE9
      const $hcanv = $hcanvOrig.clone();
      $hcanvOrig.replaceWith($hcanv);

      const hcanv = $hcanv[0];

      // Set the canvas size to the width of the container
      let rulerLen = scanvas[lentype]();
      const totalLen = rulerLen;
      hcanv.parentNode.style[lentype] = totalLen + "px";
      let ctx = hcanv.getContext("2d");
      let ctxArr, num, ctxArrNum;

      ctx.fillStyle = "rgb(200,0,0)";
      ctx.fillRect(0, 0, hcanv.width, hcanv.height);

      // Remove any existing canvasses
      $hcanv.siblings().remove();

      // Create multiple canvases when necessary (due to browser limits)
      if (rulerLen >= limit) {
        ctxArrNum = parseInt(rulerLen / limit) + 1;
        ctxArr = [];
        ctxArr[0] = ctx;
        let copy;
        for (i = 1; i < ctxArrNum; i++) {
          hcanv[lentype] = limit;
          copy = hcanv.cloneNode(true);
          hcanv.parentNode.append(copy);
          ctxArr[i] = copy.getContext("2d");
        }

        copy[lentype] = rulerLen % limit;

        // set copy width to last
        rulerLen = limit;
      }

      hcanv[lentype] = rulerLen;

      const uMulti = unit * zoom;

      // Calculate the main number interval
      const rawM = 50 / uMulti;
      let multi = 1;
      for (i = 0; i < rIntervals.length; i++) {
        num = rIntervals[i];
        multi = num;
        if (rawM <= num) {
          break;
        }
      }

      const bigInt = multi * uMulti;

      ctx.font = "9px sans-serif";

      let rulerD = ((contentDim / uMulti) % multi) * uMulti;
      let labelPos = rulerD - bigInt;
      // draw big intervals
      let ctxNum = 0;
      while (rulerD < totalLen) {
        labelPos += bigInt;
        // const realD = rulerD - contentDim; // Currently unused

        const curD = Math.round(rulerD) + 0.5;
        if (isX) {
          ctx.moveTo(curD, 15);
          ctx.lineTo(curD, 0);
        } else {
          ctx.moveTo(15, curD);
          ctx.lineTo(0, curD);
        }

        num = (labelPos - contentDim) / uMulti;
        let label;
        if (multi >= 1) {
          label = Math.round(num);
        } else {
          const decs = String(multi).split(".")[1].length;
          label = num.toFixed(decs);
        }

        // Change 1000s to Ks
        if (label !== 0 && label !== 1000 && label % 1000 === 0) {
          label = label / 1000 + "K";
        }

        if (isX) {
          ctx.fillText(label, rulerD + 2, 8);
        } else {
          // draw label vertically
          const str = String(label).split("");
          for (i = 0; i < str.length; i++) {
            ctx.fillText(str[i], 1, rulerD + 9 + i * 9);
          }
        }

        const part = bigInt / 10;
        // draw the small intervals
        for (i = 1; i < 10; i++) {
          let subD = Math.round(rulerD + part * i) + 0.5;
          if (ctxArr && subD > rulerLen) {
            ctxNum++;
            ctx.stroke();
            if (ctxNum >= ctxArrNum) {
              i = 10;
              rulerD = totalLen;
              continue;
            }
            ctx = ctxArr[ctxNum];
            rulerD -= limit;
            subD = Math.round(rulerD + part * i) + 0.5;
          }

          // odd lines are slighly longer
          const lineNum = i % 2 ? 12 : 10;
          if (isX) {
            ctx.moveTo(subD, 15);
            ctx.lineTo(subD, lineNum);
          } else {
            ctx.moveTo(15, subD);
            ctx.lineTo(lineNum, subD);
          }
        }
        rulerD += bigInt;
      }
      ctx.strokeStyle = "#000";
      ctx.stroke();
    }
  }

  /**
   * @function module:SVGEditor.updateCanvas
   * @param {boolean} center
   * @param {module:math.XYObject} newCtr
   * @returns {void}
   */
  const updateCanvas = (editor.updateCanvas = function(center, newCtr) {
    const zoom = svgCanvas.getZoom();
    const wArea = workarea;
    const cnvs = $("#svgcanvas");

    let w = workarea.width(),
      h = workarea.height();
    const wOrig = w,
      hOrig = h;
    const oldCtr = {
      x: wArea[0].scrollLeft + wOrig / 2,
      y: wArea[0].scrollTop + hOrig / 2
    };
    const multi = curConfig.canvas_expansion;
    w = Math.max(wOrig, svgCanvas.contentW * zoom * multi);
    h = Math.max(hOrig, svgCanvas.contentH * zoom * multi);

    if (w === wOrig && h === hOrig) {
      workarea.css("overflow", "hidden");
    } else {
      workarea.css("overflow", "scroll");
    }

    const oldCanY = cnvs.height() / 2;
    const oldCanX = cnvs.width() / 2;
    cnvs.width(w).height(h);
    const newCanY = h / 2;
    const newCanX = w / 2;
    const offset = svgCanvas.updateCanvas(w, h);

    const ratio = newCanX / oldCanX;

    const scrollX = w / 2 - wOrig / 2; // eslint-disable-line no-shadow
    const scrollY = h / 2 - hOrig / 2; // eslint-disable-line no-shadow

    if (!newCtr) {
      const oldDistX = oldCtr.x - oldCanX;
      const newX = newCanX + oldDistX * ratio;

      const oldDistY = oldCtr.y - oldCanY;
      const newY = newCanY + oldDistY * ratio;

      newCtr = {
        x: newX,
        y: newY
      };
    } else {
      newCtr.x += offset.x;
      newCtr.y += offset.y;
    }

    if (center) {
      // Go to top-left for larger documents
      if (svgCanvas.contentW > wArea.width()) {
        // Top-left
        workarea[0].scrollLeft = offset.x - 10;
        workarea[0].scrollTop = offset.y - 10;
      } else {
        // Center
        wArea[0].scrollLeft = scrollX;
        wArea[0].scrollTop = scrollY;
      }
    } else {
      wArea[0].scrollLeft = newCtr.x - wOrig / 2;
      wArea[0].scrollTop = newCtr.y - hOrig / 2;
    }
    if (curConfig.showRulers) {
      updateRulers(cnvs, zoom);
      workarea.scroll();
    }

    svgCanvas.updateSctm();

    if (
      urldata.storagePrompt !== true &&
      editor.storagePromptState === "ignore"
    ) {
      $("#dialog_box").hide();
    }
  });

  /**
   * @fires module:svgcanvas.SvgCanvas#event:ext_toolButtonStateUpdate
   * @returns {void}
   */
  const updateToolButtonState = function() {
    const bNoFill = svgCanvas.getColor("fill") === "none";
    const bNoStroke = svgCanvas.getColor("stroke") === "none";
    const buttonsNeedingStroke = ["#tool_fhpath", "#tool_line"];
    const buttonsNeedingFillAndStroke = [
      "#tools_rect .tool_button",
      "#tools_ellipse .tool_button",
      "#tool_text",
      "#tool_path"
    ];

    if (bNoStroke) {
      buttonsNeedingStroke.forEach(btn => {
        if ($(btn).hasClass("tool_button_current")) {
          clickSelect();
        }
        $(btn).addClass("disabled");
      });
    } else {
      buttonsNeedingStroke.forEach(btn => {
        $(btn).removeClass("disabled");
      });
    }

    if (bNoStroke && bNoFill) {
      buttonsNeedingFillAndStroke.forEach(btn => {
        if ($(btn).hasClass("tool_button_current")) {
          clickSelect();
        }
        $(btn).addClass("disabled");
      });
    } else {
      buttonsNeedingFillAndStroke.forEach(btn => {
        $(btn).removeClass("disabled");
      });
    }

    svgCanvas.runExtensions(
      "toolButtonStateUpdate",
      /** @type {module:svgcanvas.SvgCanvas#event:ext_toolButtonStateUpdate} */ {
        nofill: bNoFill,
        nostroke: bNoStroke
      }
    );

    operaRepaint();
  };

  /**
   * Updates the toolbar (colors, opacity, etc) based on the selected element.
   * This function also updates the opacity and id elements that are in the
   * context panel.
   * @returns {void}
   */
  const updateToolbar = function() {
    let i, len;
    if (!Utils.isNullish(selectedElement)) {
      switch (selectedElement.tagName) {
        case "use":
        case "image":
        case "foreignObject":
          break;
        case "g":
        case "a": {
          // Look for common styles
          const childs = selectedElement.getElementsByTagName("*");
          let gWidth = null;
          for (i = 0, len = childs.length; i < len; i++) {
            const swidth = childs[i].getAttribute("stroke-width");

            if (i === 0) {
              gWidth = swidth;
            } else if (gWidth !== swidth) {
              gWidth = null;
            }
          }

          $("#stroke_width").val(gWidth === null ? "" : gWidth);

          paintBox.fill.update(true);
          paintBox.stroke.update(true);

          break;
        }
        default: {
          paintBox.fill.update(true);
          paintBox.stroke.update(true);

          $("#stroke_width").val(
            selectedElement.getAttribute("stroke-width") || 1
          );

          const dashArray =  selectedElement.getAttribute("stroke-dasharray") || "";
          let selectOption = dashArray;
          if($(`#stroke_style option[value='${dashArray}']`).length == 0) {
            selectOption = "custom";
          }
          $("#stroke_style_detail")[0].value = dashArray;
          $("#stroke_style").val(selectOption);

          let attr = selectedElement.getAttribute("stroke-linejoin") || "miter";

          if ($("#linejoin_" + attr).length) {
            setStrokeOpt($("#linejoin_" + attr)[0]);
          }

          attr = selectedElement.getAttribute("stroke-linecap") || "butt";

          if ($("#linecap_" + attr).length) {
            setStrokeOpt($("#linecap_" + attr)[0]);
          }
        }
      }
    }

    // All elements including image and group have opacity
    if (!Utils.isNullish(selectedElement)) {
      const opacPerc = (selectedElement.getAttribute("opacity") || 1.0) * 100;
      $("#group_opacity").val(opacPerc);
      $("#group_opacity_slider").slider("option", "value", opacPerc);

      const blurVal = svgCanvas.getBlur(selectedElement);
      $("#group_blur").val(blurVal);
      $("#group_blur_slider").slider("option", "value", blurVal);

      $("#elem_id").val(selectedElement.id);
      $("#elem_class").val(selectedElement.getAttribute("class"));
    }

    updateToolButtonState();
  };

  const getHref = function(elem) {
    const { tagName } = elem;

    let linkHref = null;
    if (tagName === "a") {
      linkHref = svgCanvas.getHref(elem);
      $("#g_panel").show();
    }

    if (elem.parentNode && elem.parentNode.tagName === "a") {
      if (!$(elem).siblings().length) {
        $("#a_panel").show();
        linkHref = svgCanvas.getHref(elem.parentNode);
      }
    }

    return linkHref;
  };

  const getBox = function(elem, mode) {
    let box;
    if (!elem) {
      if (mode === "select") {
        const res = svgCanvas.getResolution();
        if (curConfig.baseUnit !== "px") {
          res.w = convertUnit(res.w) + curConfig.baseUnit;
          res.h = convertUnit(res.h) + curConfig.baseUnit;
        }
        box = {
          width: res.w,
          height: res.h
        };
      }
    } else if (
      ["g", "polyline", "path", "polygon", "image"].includes(elem.nodeName)
    ) {
      box = svgCanvas.getStrokedBBox([elem]);
    } else {
      let width = getAttrValue(elem, "width");
      let height = getAttrValue(elem, "height");
      box = {
        x: elem.getAttribute("x"),
        y: elem.getAttribute("y"),
        width,
        height
      };
    }
    return box || {};
  };

  const getPathPointType = function() {
    let res = null;

    const point = path.getNodePoint();
    if (point) {
      res = point.type;
    }

    return res;
  };

  const getCustomProps = function(tagName, elem) {
    const propsMap = {
      g: [
        function title() {
          svgCanvas.getTitle();
        }
      ],
      a: [
        function href(e) {
          getHref(e);
        }
      ],
      rect: ["rx"],
      image: [
        "width",
        "height",
        function href(e) {
          getHref(e);
        }
      ],
      circle: ["cx", "cy", "r"],
      circle_pathedit: [
        "cx",
        "cy",
        "r",
        function type() {
          return getPathPointType();
        },
        function closed() {
          return path.closed_subpath;
        }
      ],
      ellipse: ["cx", "cy", "rx", "ry"],
      line: ["x1", "y1", "x2", "y2"],
      polygon: ["sides:points"],
      text: [
        "font-family",
        "font-weight",
        "font-size",
        function isItalic() {
          return svgCanvas.getItalic();
        },
        function isBold() {
          return svgCanvas.getBold();
        },
        function isLineThrough() {
          return svgCanvas.getLineThrough();
        },
        function isUnderline() {
          return svgCanvas.getUnderline();
        },
        function isTextAlignLeft() {
          return svgCanvas.getAlignLeft();
        },
        function isTextAlignCenter() {
          return svgCanvas.getAlignCenter();
        },
        function isTextAlignRight() {
          return svgCanvas.getAlignRight();
        }
      ],
      input: [
        "font-family",
        "font-weight",
        "font-size",
        "input-name",
        "input-type",
        "input-autocomplete",
        function isItalic() {
          return svgCanvas.getItalic();
        },
        function isBold() {
          return svgCanvas.getBold();
        },
        function isLineThrough() {
          return svgCanvas.getLineThrough();
        },
        function isUnderline() {
          return svgCanvas.getUnderline();
        },
        function isTextAlignLeft() {
          return svgCanvas.getAlignLeft();
        },
        function isTextAlignCenter() {
          return svgCanvas.getAlignCenter();
        },
        function isTextAlignRight() {
          return svgCanvas.getAlignRight();
        }
      ],
      use: [
        function title() {
          svgCanvas.getTitle();
        }
      ]
    };

    const res = {};
    const props = propsMap[elem.dataset.as ? elem.dataset.as : tagName];

    if (props) {
      $.each(props, function(i, item) {
        if (typeof item === "function") {
          res[item.name] = item(elem);
        } else {
          let [prop, alias] = item.split(":");
          if (!alias) {
            alias = prop;
          }
          res[alias] = getAttrValue(elem, prop);
        }
      });
    }

    return res;
  };

  function getAttrValue(elem, attr) {
    let attrVal = elem.getAttribute(attr);
    if (elem.dataset.as) {
      attrVal = elem.dataset[Utils.toDataSetProp(attr)];
    }
    if (curConfig.baseUnit !== "px" && elem[attr]) {
      const bv = elem[attr].baseVal.value;
      attrVal = convertUnit(bv);
    }
    return attrVal;
  }

  const getSelectedInfo = function() {
    const elem = selectedElement;
    const isNull = Utils.isNullish(elem);
    const isDeleted = !isNull && !elem.parentNode;
    const isNew = svgCanvas.addedNew;
    const layerName = svgCanvas.getCurrentDrawing().getCurrentLayerName();
    const unit = curConfig.baseUnit !== "px" ? curConfig.baseUnit : null;
    const mode = svgCanvas.getMode();
    const subMode = svgCanvas.getSubMode();
    const stroke_color = null;
    const { x, y, width, height } = getBox(elem, mode);
    let { nodeName: type, tagName } = elem || {
      nodeName: null,
      tagName: null
    };

    if (mode !== "select") {
      type = mode;
    }

    if (type === "rect" && elem && elem.dataset.as) {
      type = selectedElement.dataset.as;
    }

    let angle,
      blur = 0;
    let customProps = {};

    if (!isNull) {
      angle = svgCanvas.getRotationAngle(elem);
      blur = svgCanvas.getBlur(elem);
      if (mode === "pathedit") {
        tagName = `${tagName}_${mode}`;
      }
      customProps = getCustomProps(tagName, elem);
    } else if (mode === "select") {
      type = "page";

      customProps.title = svgCanvas.getDocumentTitle();
    }

    return {
      type,
      mode,
      subMode,
      isDeleted,
      isNew,
      layerName,
      unit,
      x,
      y,
      width,
      height,
      blur,
      angle,
      pathInfo: path,
      customProps,
      multiselected
    };
  };

  /**
   * Updates the context panel tools based on the selected element.
   * @returns {void}
   */
  const updateContextPanel = function() {
    const info = getSelectedInfo();

    Utils.updateCursor(info.mode, info.subMode);

    $("#panel_position, #panel_tranformar, #panel_documento, #panel_apariencia")
      .find(".g-property-row")
      .hide()
      .end()
      .hide();

    if (info.type === "text" && selectedElement && selectedElement.dataset.inputElement) {
      currentInputIndex = inputElements.findIndex(e => e.id == selectedElement.dataset.inputElement);
    }

    console.log(info);

    const panels = {
      page: "#panel_documento .g-property-row",
      rect:
        "#panel_position .g-property-row,.g-property-row.corner-radius,.g-property-row.opacity,.g-property-row.blur",
      path:
        "#panel_position .g-property-row,.g-property-row.opacity,.g-property-row.blur",
      polygon:
        "#panel_position .g-property-row, #panel_apariencia .g-property-row:eq(0)",
      input:
        "#panel_position .g-property-row,#panel_position, #panel_apariencia .text-properties-panel .g-property-row",
      text:
        "#panel_position .g-property-row,#panel_position, #panel_apariencia .text-properties-panel .g-property-row",
      textedit:
        "#panel_position .g-property-row, #panel_apariencia .text-properties-panel .g-property-row",
      image:
        "#panel_position .g-property-row, .g-property-row.opacity,.g-property-row.blur, #panel_apariencia .image-properties-panel .g-property-row"
    }[info.type];

    if (panels) {
      $(panels)
        .parents(".root-panel")
        .show()
        .set(info)
        .end()
        .show();
    }

    // update history buttons
    $("#tool_undo").prop("disabled", undoMgr.getUndoStackSize() === 0);
    $("#tool_redo").prop("disabled", undoMgr.getRedoStackSize() === 0);
    $("#menuDropDown").hide();
    $("#layerToMove").hide();

    if (info.isNew) {
      populateElements();
      svgCanvas.addedNew = false;
    }
  };

  /**
   *
   * @returns {void}
   */
  const updateWireFrame = function() {
    // Test support
    if (supportsNonSS) {
      return;
    }

    const rule = `
      #workarea.wireframe #svgcontent * {
        stroke-width: ${1 / svgCanvas.getZoom()}px;
      }
    `;
    $("#wireframe_rules").text(workarea.hasClass("wireframe") ? rule : "");
  };

  let curContext = "";

  /**
   * @param {string} [title=svgCanvas.getDocumentTitle()]
   * @returns {void}
   */
  const updateTitle = function(title) {
    title = title || svgCanvas.getDocumentTitle();
    const newTitle = origTitle + (title ? ": " + title : "");

    // Remove title update with current context info, isn't really necessary
    // if (curContext) {
    //   new_title = new_title + curContext;
    // }
    $("title:first").text(newTitle);
  };

  // called when we've selected a different element
  /**
   *
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:selected} elems Array of elements that were selected
   * @listens module:svgcanvas.SvgCanvas#event:selected
   * @fires module:svgcanvas.SvgCanvas#event:ext_selectedChanged
   * @returns {void}
   */
  const selectedChanged = function(win, elems) {
    const mode = svgCanvas.getMode();
    if (mode === "select") {
      setSelectMode();
    }
    const isNode = mode === "pathedit";
    // if elems[1] is present, then we have more than one element
    selectedElement =
      elems.length === 1 || Utils.isNullish(elems[1]) ? elems[0] : null;
    multiselected = elems.length >= 2 && !Utils.isNullish(elems[1]);
    if (!Utils.isNullish(selectedElement)) {
      // unless we're already in always set the mode of the editor to select because
      // upon creation of a text element the editor is switched into
      // select mode and this event fires - we need our UI to be in sync

      if (!isNode) {
        updateToolbar();
      }
    } // if (!Utils.isNullish(elem))

    // Deal with pathedit mode
    togglePathEditMode(isNode, elems);
    updateContextPanel();
    updateSelectedLayerElements();
    svgCanvas.runExtensions(
      "selectedChanged",
      /** @type {module:svgcanvas.SvgCanvas#event:ext_selectedChanged} */ {
        elems,
        selectedElement,
        multiselected
      }
    );
  };

  // Call when part of element is in process of changing, generally
  // on mousemove actions like rotate, move, etc.
  /**
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:transition} elems
   * @listens module:svgcanvas.SvgCanvas#event:transition
   * @fires module:svgcanvas.SvgCanvas#event:ext_elementTransition
   * @returns {void}
   */
  const elementTransition = function(win, elems) {
    const mode = svgCanvas.getMode();
    const elem = elems[0];

    if (!elem) {
      return;
    }

    multiselected = elems.length >= 2 && !Utils.isNullish(elems[1]);
    // Only updating fields for single elements for now
    if (!multiselected) {
      switch (mode) {
        case "rotate": {
          const ang = svgCanvas.getRotationAngle(elem);
          $("#angle").val(ang);
          $("#tool_reorient").toggleClass("disabled", ang === 0);
          break;

          // TODO: Update values that change on move/resize, etc
          // } case 'select': {
          // } case 'resize': {
          //   break;
          // }
        }
      }
    }
    svgCanvas.runExtensions(
      "elementTransition",
      /** @type {module:svgcanvas.SvgCanvas#event:ext_elementTransition} */ {
        elems
      }
    );
  };

  /**
   * Test whether an element is a layer or not.
   * @param {SVGGElement} elem - The SVGGElement to test.
   * @returns {boolean} True if the element is a layer
   */
  function isLayer(elem) {
    return (
      elem &&
      elem.tagName === "g" &&
      Layer.CLASS_REGEX.test(elem.getAttribute("class"))
    );
  }

  // called when any element has changed
  /**
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:changed} elems
   * @listens module:svgcanvas.SvgCanvas#event:changed
   * @fires module:svgcanvas.SvgCanvas#event:ext_elementChanged
   * @returns {void}
   */
  const elementChanged = function(win, elems) {
    const mode = svgCanvas.getMode();
    if (mode === "select") {
      setSelectMode();
    }

    elems.forEach(elem => {
      const isSvgElem = elem && elem.tagName === "svg";
      if (isSvgElem || isLayer(elem)) {
        populateLayers();
        // if the element changed was the svg, then it could be a resolution change
        if (isSvgElem) {
          updateCanvas();
        }
        // Update selectedElement if element is no longer part of the image.
        // This occurs for the text elements in Firefox
      } else if (
        elem &&
        selectedElement &&
        Utils.isNullish(selectedElement.parentNode)
      ) {
        // || elem && elem.tagName == "path" && !multiselected) { // This was added in r1430, but not sure why
        selectedElement = elem;
      }
    });

    editor.showSaveWarning = true;

    // we update the contextual panel with potentially new
    // positional/sizing information (we DON'T want to update the
    // toolbar here as that creates an infinite loop)
    // also this updates the history buttons

    // we tell it to skip focusing the text control if the
    // text element was previously in focus
    updateContextPanel();

    // In the event a gradient was flipped:
    if (selectedElement && mode === "select") {
      paintBox.fill.update();
      paintBox.stroke.update();
    }

    populateElements();

    svgCanvas.runExtensions(
      "elementChanged",
      /** @type {module:svgcanvas.SvgCanvas#event:ext_elementChanged} */ {
        elems
      }
    );
  };

  /**
   * @returns {void}
   */
  const zoomDone = function() {
    updateWireFrame();
    // updateCanvas(); // necessary?
  };

  /**
   * @typedef {PlainObject} module:SVGEditor.BBoxObjectWithFactor (like `DOMRect`)
   * @property {Float} x
   * @property {Float} y
   * @property {Float} width
   * @property {Float} height
   * @property {Float} [factor] Needed if width or height are 0
   * @property {Float} [zoom]
   * @see module:svgcanvas.SvgCanvas#event:zoomed
   */

  /**
   * @function module:svgcanvas.SvgCanvas#zoomChanged
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:zoomed} bbox
   * @param {boolean} autoCenter
   * @listens module:svgcanvas.SvgCanvas#event:zoomed
   * @returns {void}
   */
  const zoomChanged = (svgCanvas.zoomChanged = function(win, bbox, autoCenter) {
    const scrbar = 15,
      // res = svgCanvas.getResolution(), // Currently unused
      wArea = workarea;
    // const canvasPos = $('#svgcanvas').position(); // Currently unused
    const zInfo = svgCanvas.setBBoxZoom(
      bbox,
      wArea.width() - scrbar,
      wArea.height() - scrbar
    );
    if (!zInfo) {
      return;
    }
    const zoomlevel = zInfo.zoom,
      bb = zInfo.bbox;

    if (zoomlevel < 0.001) {
      changeZoom({ value: 0.1 });
      return;
    }

    $("#zoom_dropdown")
      .find(".caption")
      .text((zoomlevel * 100).toFixed(1));

    if (autoCenter) {
      updateCanvas();
    } else {
      updateCanvas(false, {
        x: bb.x * zoomlevel + (bb.width * zoomlevel) / 2,
        y: bb.y * zoomlevel + (bb.height * zoomlevel) / 2
      });
    }

    if (svgCanvas.getMode() === "zoom" && bb.width) {
      // Go to select if a zoom box was drawn
      setSelectMode();
    }

    zoomDone();
  });

  /**
   * @type {module:jQuerySpinButton.ValueCallback}
   */
  const changeZoom = function(ctl) {
    const zoomlevel = ctl.value / 100;
    if (zoomlevel < 0.001) {
      ctl.value = 0.1;
      return;
    }
    const zoom = svgCanvas.getZoom();
    const wArea = workarea;

    zoomChanged(
      window,
      {
        width: 0,
        height: 0,
        // center pt of scroll position
        x: (wArea[0].scrollLeft + wArea.width() / 2) / zoom,
        y: (wArea[0].scrollTop + wArea.height() / 2) / zoom,
        zoom: zoomlevel
      },
      true
    );
  };

  $("#cur_context_panel").delegate("a", "click", function() {
    const link = $(this);
    if (link.attr("data-root")) {
      svgCanvas.leaveContext();
    } else {
      svgCanvas.setContext(link.text());
    }
    svgCanvas.clearSelection();
    return false;
  });

  /**
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:contextset} context
   * @listens module:svgcanvas.SvgCanvas#event:contextset
   * @returns {void}
   */
  const contextChanged = function(win, context) {
    let linkStr = "";
    if (context) {
      let str = "";
      linkStr =
        '<a href="#" data-root="y">' +
        svgCanvas.getCurrentDrawing().getCurrentLayerName() +
        "</a>";

      $(context)
        .parentsUntil("#svgcontent > g")
        .andSelf()
        .each(function() {
          if (this.id) {
            str += " > " + this.id;
            if (this !== context) {
              linkStr += ' > <a href="#">' + this.id + "</a>";
            } else {
              linkStr += " > " + this.id;
            }
          }
        });

      curContext = str;
    } else {
      curContext = null;
    }
    $("#cur_context_panel")
      .toggle(Boolean(context))
      .html(linkStr);

    updateTitle();
  };

  /**
   * Makes sure the current selected paint is available to work with.
   * @returns {void}
   */
  const prepPaints = function() {
    paintBox.fill.prep();
    paintBox.stroke.prep();
  };

  const flyoutFuncs = {};

  const allHolders = {};

  /**
   * @param {string} id
   * @param {external:jQuery} child
   * @returns {external:jQuery}
   */
  const makeFlyoutHolder = function(id, child) {
    const div = $("<div>", {
      class: "tools_flyout",
      id
    })
      .appendTo("#svg_editor")
      .append(child);

    return div;
  };

  /**
   * @param {string} elemSel
   * @param {string} listSel
   * @param {external:jQuery.Function} callback
   * @param {PlainObject} opts
   * @param {boolean} opts.dropUp
   * @param {boolean} opts.seticon
   * @param {boolean} opts.multiclick
   * @todo Combine this with `addDropDown` or find other way to optimize.
   * @returns {void}
   */
  const addAltDropDown = function(elemSel, listSel, callback, opts) {
    const button = $(elemSel);
    const { dropUp } = opts;
    const list = $(listSel);
    if (dropUp) {
      $(elemSel).addClass("dropup");
    }
    list.find("li").bind("mouseup", function(...args) {
      if (opts.seticon) {
        setIcon("#cur_" + button[0].id, $(this).children());
        $(this)
          .addClass("current")
          .siblings()
          .removeClass("current");
      }
      callback.apply(this, ...args);
    });

    let onButton = false;
    $(window).mouseup(function(evt) {
      if (!onButton) {
        button.removeClass("down");
        list.hide();
        list.css({ top: 0, left: 0 });
      }
      onButton = false;
    });

    // const height = list.height(); // Currently unused
    button
      .bind("mousedown", function() {
        const off = { top: 40, left: 0 };
        const left = list.data("left");
        if (left) {
          off.left = parseFloat(left);
        }
        const top = list.data("top");
        if (top) {
          off.top = parseFloat(top);
        }
        list.offset(off);

        if (!button.hasClass("down")) {
          list.show();
          onButton = true;
        } else {
          // CSS position must be reset for Webkit
          list.hide();
          list.css({ top: 0, left: 0 });
        }
        button.toggleClass("down");
      })
      .hover(function() {
        onButton = true;
      })
      .mouseout(function() {
        onButton = false;
      });

    if (opts.multiclick) {
      list.mousedown(function() {
        onButton = true;
      });
    }
  };

  const extsPreLang = [];
  /**
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:extension_added} ext
   * @listens module:svgcanvas.SvgCanvas#event:extension_added
   * @returns {Promise<void>|void} Resolves to `undefined`
   */
  const extAdded = async function(win, ext) {
    if (!ext) {
      return undefined;
    }
    let cbCalled = false;
    let resizeDone = false;

    if (ext.langReady) {
      if (editor.langChanged) {
        // We check for this since the "lang" pref could have been set by storage
        const lang = editor.pref("lang");
        const locale = await getImportLocale({
          defaultLang: lang,
          defaultName: ext.name
        });
        await ext.langReady({
          lang,
          uiStrings,
          importLocale: locale
        });
        loadedExtensionNames.push(ext.name);
      } else {
        extsPreLang.push(ext);
      }
    }

    /**
     * Clear resize timer if present and if not previously performed,
     *   perform an icon resize.
     * @returns {void}
     */
    function prepResize() {
      if (resizeTimer) {
        clearTimeout(resizeTimer);
        resizeTimer = null;
      }
      if (!resizeDone) {
        resizeTimer = setTimeout(function() {
          resizeDone = true;
          setIconSize(editor.pref("iconsize"));
        }, 50);
      }
    }

    /**
     *
     * @returns {void}
     */
    const runCallback = function() {
      if (ext.callback && !cbCalled) {
        cbCalled = true;
        ext.callback.call(editor);
      }
    };

    const btnSelects = [];

    const { svgicons } = ext;
    if (ext.buttons) {
      const fallbackObj = {},
        altsObj = {},
        placementObj = {},
        holders = {};

      // Add buttons given by extension
      $.each(ext.buttons, function(
        i,
        /** @type {module:SVGEditor.Button} */ btn
      ) {
        let { id } = btn;
        let button = $(`#${id}`);

        $.each(btn.events, function(name, func) {
          if (name === "click" && btn.type === "mode") {
            // `touch.js` changes `touchstart` to `mousedown`,
            //   so we must map extension click events as well
            if (isTouch() && name === "click") {
              name = "mousedown";
            }
            if (btn.includeWith) {
              button.bind(name, func);
            } else {
              button.bind(name, function() {
                if (toolButtonClick(button)) {
                  func();
                }
                updateContextPanel();
              });
            }
            if (btn.key) {
              $(document).bind("keydown", btn.key, func);
              if (btn.title) {
                button.attr("title", btn.title + " [" + btn.key + "]");
              }
            }
          } else {
            button.bind(name, func);
          }
        });
      });
    }
    return runCallback();
  };

  /**
   * @param {string} color
   * @param {Float} opac
   * @param {string} type
   * @returns {module:jGraduate~Paint}
   */
  const getPaint = function(color, opac, type) {
    // update the editor's fill paint
    const opts = { alpha: opac };
    if (color.startsWith("url(#")) {
      let refElem = svgCanvas.getRefElem(color);
      if (refElem) {
        refElem = refElem.cloneNode(true);
      } else {
        refElem = $("#" + type + "_color defs *")[0];
      }
      opts[refElem.tagName] = refElem;
    } else if (color.startsWith("#")) {
      opts.solidColor = color.substr(1);
    } else {
      opts.solidColor = "none";
    }
    return new $.jGraduate.Paint(opts);
  };

  // $('#text').focus(function () { textBeingEntered = true; });
  // $('#text').blur(function () { textBeingEntered = false; });

  // bind the selected event to our function that handles updates to the UI
  svgCanvas.bind("selected", selectedChanged);
  svgCanvas.bind("transition", elementTransition);
  svgCanvas.bind("changed", elementChanged);
  svgCanvas.bind("saved", saveHandler);
  svgCanvas.bind("exported", exportHandler);
  svgCanvas.bind("exportedPDF", function(win, data) {
    if (!data.output) {
      // Ignore Chrome
      return;
    }
    const { exportWindowName } = data;
    if (exportWindowName) {
      exportWindow = window.open("", exportWindowName); // A hack to get the window via JSON-able name without opening a new one
    }
    if (!exportWindow || exportWindow.closed) {
      /* await */ $.alert(uiStrings.notification.popupWindowBlocked);
      return;
    }
    exportWindow.location.href = data.output;
  });
  svgCanvas.bind("zoomed", zoomChanged);
  svgCanvas.bind("zoomDone", zoomDone);
  svgCanvas.bind(
    "updateCanvas",
    /**
     * @param {external:Window} win
     * @param {PlainObject} centerInfo
     * @param {false} centerInfo.center
     * @param {module:math.XYObject} centerInfo.newCtr
     * @listens module:svgcanvas.SvgCanvas#event:updateCanvas
     * @returns {void}
     */
    function(win, { center, newCtr }) {
      updateCanvas(center, newCtr);
    }
  );
  svgCanvas.bind("contextset", contextChanged);
  svgCanvas.bind("extension_added", extAdded);
  svgCanvas.textActions.setInputElem($("#text")[0]);

  let str = '<div class="palette_item" data-rgb="none"></div>';
  $.each(palette, function(i, item) {
    str +=
      '<div class="palette_item" style="background-color: ' +
      item +
      ';" data-rgb="' +
      item +
      '"></div>';
  });
  $("#palette").append(str);

  // Set up editor background functionality
  const colorBlocks = ["#FFF", "#888", "#000", "chessboard"];
  str = "";
  $.each(colorBlocks, function(i, e) {
    if (e === "chessboard") {
      str +=
        '<div class="color_block" data-bgcolor="' +
        e +
        '" style="background-image:url(data:image/gif;base64,R0lGODlhEAAQAIAAAP///9bW1iH5BAAAAAAALAAAAAAQABAAAAIfjG+gq4jM3IFLJgpswNly/XkcBpIiVaInlLJr9FZWAQA7);"></div>';
    } else {
      str +=
        '<div class="color_block" data-bgcolor="' +
        e +
        '" style="background-color:' +
        e +
        ';"></div>';
    }
  });
  $("#bg_blocks").append(str);
  const blocks = $("#bg_blocks div");
  const curBg = "cur_background";
  blocks.each(function() {
    const blk = $(this);
    blk.click(function() {
      blocks.removeClass(curBg);
      $(this).addClass(curBg);
    });
  });

  setBackground(editor.pref("bkgd_color"), editor.pref("bkgd_url"));

  $("#image_save_opts input").val([editor.pref("img_save")]);

  /**
   * @type {module:jQuerySpinButton.ValueCallback}
   */
  const changeRectRadius = function(ctl) {
    svgCanvas.setRectRadius(ctl.value);
  };

  /**
   * @type {module:jQuerySpinButton.ValueCallback}
   */
  const changeFontSize = function(ctl) {
    svgCanvas.setFontSize(ctl.value);
  };

  /**
   * @type {module:jQuerySpinButton.ValueCallback}
   */
  const changeStrokeWidth = function(ctl) {
    let val = ctl.value;
    if (
      val === 0 &&
      selectedElement &&
      ["line", "polyline"].includes(selectedElement.nodeName)
    ) {
      val = ctl.value = 1;
    }
    svgCanvas.setStrokeWidth(val);
  };

  /**
   * @type {module:jQuerySpinButton.ValueCallback}
   */
  const changeRotationAngle = function(ctl) {
    svgCanvas.setRotationAngle(ctl.value);
    $("#tool_reorient").toggleClass("disabled", parseInt(ctl.value) === 0);
  };

  /**
   * @param {external:jQuery.fn.SpinButton} ctl Spin Button
   * @param {string} [val=ctl.value]
   * @returns {void}
   */
  const changeOpacity = function(ctl, val) {
    if (Utils.isNullish(val)) {
      val = ctl.value;
    }
    $("#group_opacity").val(val);
    if (!ctl || !ctl.handle) {
      $("#opac_slider").slider("option", "value", val);
    }
    svgCanvas.setOpacity(val / 100);
  };

  const changeFillOpacity = function(ctl, val) {
    if (Utils.isNullish(val)) {
      val = ctl.value;
    }
    $("#group_fill_opacity").val(val);
    if (!ctl || !ctl.handle) {
      $("#group_fill_opacity_slider").slider("option", "value", val);
    }

    paintBox.fill.setOpacity(val, true, true);
  };


  const changeStrokeOpacity = function(ctl, val) {
    if (Utils.isNullish(val)) {
      val = ctl.value;
    }
    $("#group_stroke_opacity").val(val);
    if (!ctl || !ctl.handle) {
      $("#group_stroke_opacity_slider").slider("option", "value", val);
    }

    paintBox.stroke.setOpacity(val, true, true);
  };

  const changePoints = function(ctl, val) {
    if (Utils.isNullish(val)) {
      val = ctl.value;
    }
    $("#inputPoints").val(val);
  };

  /**
   * @param {external:jQuery.fn.SpinButton} ctl Spin Button
   * @param {string} [val=ctl.value]
   * @param {boolean} noUndo
   * @returns {void}
   */
  const changeBlur = function(ctl, val, noUndo) {
    if (Utils.isNullish(val)) {
      val = ctl.value;
    }
    $("#blur").val(val);
    let complete = false;
    if (!ctl || !ctl.handle) {
      $("#blur_slider").slider("option", "value", val);
      complete = true;
    }
    if (noUndo) {
      svgCanvas.setBlurNoUndo(val);
    } else {
      svgCanvas.setBlur(val, complete);
    }
  };

  $("#stroke_style").change(function() {
    const val = $(this).val();
    if (val !== "custom") {
      $("#stroke_style_detail").val(val);
      svgCanvas.setStrokeAttr("stroke-dasharray", val);
      operaRepaint();
    }
  });

  $("#stroke_style_detail").change(function() {
    svgCanvas.setStrokeAttr("stroke-dasharray", $(this).val());
    operaRepaint();
  });

  $("#stroke_linejoin").change(function() {
    svgCanvas.setStrokeAttr("stroke-linejoin", $(this).val());
    operaRepaint();
  });

  // Lose focus for select elements when changed (Allows keyboard shortcuts to work better)
  $("select").change(function() {
    $(this).blur();
  });

  // fired when user wants to move elements to another layer
  let promptMoveLayerOnce = false;
  $("#selLayerNames").change(async function() {
    const destLayer = this.options[this.selectedIndex].value;
    const confirmStr = uiStrings.notification.QmoveElemsToLayer.replace(
      "%s",
      destLayer
    );
    /**
     * @param {boolean} ok
     * @returns {void}
     */
    const moveToLayer = function(ok) {
      if (!ok) {
        return;
      }
      promptMoveLayerOnce = true;
      svgCanvas.moveSelectedToLayer(destLayer);
      svgCanvas.clearSelection();
      populateLayers();
    };
    if (destLayer) {
      if (promptMoveLayerOnce) {
        moveToLayer(true);
      } else {
        const ok = await $.confirm(confirmStr);
        if (!ok) {
          return;
        }
        moveToLayer(true);
      }
    }
  });

  $("#font_family").change(function() {
    svgCanvas.setFontFamily(this.value);
  });

  $("#font_weight").change(function() {
    svgCanvas.setFontWeight(this.value);
  });

  $("#seg_type").change(function() {
    svgCanvas.setSegType($(this).val());
  });

  $("#text").bind("keyup input", function(e) {
    svgCanvas.setTextContent(this.value);
  });

  $("#text").keydown(function(e) {
    if (e.which == 9) { // TAB
      e.preventDefault();
      currentInputIndex += 1;
      if (currentInputIndex == inputElements.length) {
        currentInputIndex = 0;
      }
      const current = inputElements[currentInputIndex];
      svgCanvas.focusInput(current);
      // const rect = current.getBoundingClientRect();
      //$("#autocompleteDropDown").show().css({top: rect.top + rect.height + 5, left: rect.left});
    }
  });

  $("#image_url").change(function() {
    setImageURL(this.value);
  });

  $("#link_url").change(function() {
    if (this.value.length) {
      svgCanvas.setLinkURL(this.value);
    } else {
      svgCanvas.removeHyperlink();
    }
  });

  $("#g_title").change(function() {
    svgCanvas.setGroupTitle(this.value);
  });

  $(".attr_changer").change(function() {
    const attr = this.getAttribute("data-attr");
    let val = this.value;
    const valid = isValidUnit(attr, val, selectedElement);

    if (!valid) {
      this.value = selectedElement.getAttribute(attr);
      /* await */ $.alert(uiStrings.notification.invalidAttrValGiven);
      return false;
    }

    if (attr !== "id" && attr !== "class") {
      if (isNaN(val)) {
        val = svgCanvas.convertToNum(attr, val);
      } else if (curConfig.baseUnit !== "px") {
        // Convert unitless value to one with given unit

        const unitData = getTypeMap();

        if (
          selectedElement[attr] ||
          svgCanvas.getMode() === "pathedit" ||
          attr === "x" ||
          attr === "y"
        ) {
          val *= unitData[curConfig.baseUnit];
        }
      }
    }

    // if the user is changing the id, then de-select the element first
    // change the ID, then re-select it with the new ID
    if (attr === "id") {
      const elem = selectedElement;
      svgCanvas.clearSelection();
      elem.id = val;
      svgCanvas.addToSelection([elem], true);
    } else {
      svgCanvas.changeSelectedAttribute(attr, val);
    }
    this.blur();
    return true;
  });

  // Prevent selection of elements when shift-clicking
  $("#palette").mouseover(function() {
    const inp = $('<input type="hidden">');
    $(this).append(inp);
    inp.focus().remove();
  });

  $(".palette_item")
    .mousedown(function(evt) {
      // shift key or right click for stroke
      const picker = evt.shiftKey || evt.button === 2 ? "stroke" : "fill";
      let color = $(this).data("rgb");
      let paint;

      // Webkit-based browsers returned 'initial' here for no stroke
      if (color === "none" || color === "transparent" || color === "initial") {
        color = "none";
        paint = new $.jGraduate.Paint();
      } else {
        paint = new $.jGraduate.Paint({
          alpha: 100,
          solidColor: color.substr(1)
        });
      }

      paintBox[picker].setPaint(paint);
      svgCanvas.setColor(picker, color);

      if (color !== "none" && svgCanvas.getPaintOpacity(picker) !== 1) {
        svgCanvas.setPaintOpacity(picker, 1.0);
      }
      updateToolButtonState();
    })
    .bind("contextmenu", function(e) {
      e.preventDefault();
    });

  $("#toggle_stroke_tools").on("click", function() {
    $("#tools_bottom").toggleClass("expanded");
  });

  (function() {
    const wArea = workarea[0];

    let lastX = null,
      lastY = null,
      panning = false,
      keypan = false;

    $("#svgcanvas")
      .bind("mousemove mouseup", function(evt) {
        if (panning === false) {
          return true;
        }

        wArea.scrollLeft -= evt.clientX - lastX;
        wArea.scrollTop -= evt.clientY - lastY;

        lastX = evt.clientX;
        lastY = evt.clientY;

        if (evt.type === "mouseup") {
          panning = false;
        }
        return false;
      })
      .mousedown(function(evt) {
        if (evt.button === 1 || keypan === true) {
          panning = true;
          lastX = evt.clientX;
          lastY = evt.clientY;
          return false;
        }
        return true;
      });

    $(window).mouseup(function() {
      panning = false;
    });

    $(document)
      .bind("keydown", "space", function(evt) {
        svgCanvas.spaceKey = keypan = true;
        evt.preventDefault();
      })
      .bind("keyup", "space", function(evt) {
        evt.preventDefault();
        svgCanvas.spaceKey = keypan = false;
      })
      .bind("keydown", "shift", function(evt) {
        if (svgCanvas.getMode() === "zoom") {
          workarea.css("cursor", zoomOutIcon);
        }
      })
      .bind("keyup", "shift", function(evt) {
        if (svgCanvas.getMode() === "zoom") {
          workarea.css("cursor", zoomInIcon);
        }
      });

    /**
     * @param {boolean} active
     * @returns {void}
     */
    editor.setPanning = function(active) {
      svgCanvas.spaceKey = keypan = active;
    };

    editor.setCursor = function(elemsCursor, canvasCursor) {
      Utils.setCursor(elemsCursor, canvasCursor);
    };
  })();

  (function() {
    const button = $("#main_icon");
    const overlay = $("#main_icon span");
    const list = $("#main_menu");

    let onButton = false;
    let height = 0;
    let jsHover = true;
    let setClick = false;

    /*
    // Currently unused
    const hideMenu = function () {
      list.fadeOut(200);
    };
    */

    $(window)
      .mouseup(function(evt) {
        if (!onButton) {
          button.removeClass("buttondown");
          // do not hide if it was the file input as that input needs to be visible
          // for its change event to fire
          if (evt.target.tagName !== "INPUT") {
            list.fadeOut(200);
          } else if (!setClick) {
            setClick = true;
            $(evt.target).click(function() {
              list.css("margin-left", "-9999px").show();
            });
          }
        }
        onButton = false;
      })
      .mousedown(function(evt) {
        // $('.contextMenu').hide();
        const islib = $(evt.target).closest("div.tools_flyout, .contextMenu")
          .length;
        if (!islib) {
          $(".tools_flyout:visible,.contextMenu").fadeOut(250);
        }
      });

    overlay
      .bind("mousedown", function() {
        if (!button.hasClass("buttondown")) {
          // Margin must be reset in case it was changed before;
          list.css("margin-left", 0).show();
          if (!height) {
            height = list.height();
          }
          // Using custom animation as slideDown has annoying 'bounce effect'
          list.css("height", 0).animate(
            {
              height
            },
            200
          );
          onButton = true;
        } else {
          list.fadeOut(200);
        }
        button.toggleClass("buttondown buttonup");
      })
      .hover(function() {
        onButton = true;
      })
      .mouseout(function() {
        onButton = false;
      });

    const listItems = $("#main_menu li");

    // Check if JS method of hovering needs to be used (Webkit bug)
    listItems.mouseover(function() {
      jsHover = $(this).css("background-color") === "rgba(0, 0, 0, 0)";

      listItems.unbind("mouseover");
      if (jsHover) {
        listItems
          .mouseover(function() {
            this.style.backgroundColor = "#FFC";
          })
          .mouseout(function() {
            this.style.backgroundColor = "transparent";
            return true;
          });
      }
    });
  })();
  // Made public for UI customization.
  // TODO: Group UI functions into a public editor.ui interface.
  /**
   * See {@link http://api.jquery.com/bind/#bind-eventType-eventData-handler}.
   * @callback module:SVGEditor.DropDownCallback
   * @param {external:jQuery.Event} ev See {@link http://api.jquery.com/Types/#Event}
   * @listens external:jQuery.Event
   * @returns {void|boolean} Calls `preventDefault()` and `stopPropagation()`
   */
  /**
   * @param {Element|string} elem DOM Element or selector
   * @param {module:SVGEditor.DropDownCallback} callback Mouseup callback
   * @param {boolean} dropUp
   * @returns {void}
   */
  editor.addDropDown = function(elem, callback, dropUp) {
    console.log("addDropDown ", elem);
  };

  editor.buildMenu = function(rootPanel, items, cb) {
    const menuDropDown = $("#menuDropDown");
    $(rootPanel).click(function(e) {
      e.stopPropagation();
      const left = $(rootPanel).data("left") || ( e.clientX - 44 );
      const top = $(rootPanel).data("top") || 37;
      menuDropDown.children("li").remove();

      for (const item of items) {
        const { value, text } = item;
        $(`<li class="g-menu-item has-icon">
      <span class="g-menu-item-icon"></span>
      <span class="g-menu-item-caption">${text}</span>
      <span class="g-menu-item-info"></span>
      <span class="g-menu-item-tail"></span>
      </li>`)
          .appendTo(menuDropDown)
          .hover(
            function() {
              $(this).addClass("g-hover");
            },
            function() {
              $(this).removeClass("g-hover");
            }
          )
          .data("value", value)
          .click(function() {
            cb({ value, text });
          });
      }

      menuDropDown.css({ top, left }).show();
    });
  };

  // For slider usage, see: http://jqueryui.com/demos/slider/
  $("#opac_slider").slider({
    start() {
      $("#opacity_dropdown li:not(.special)").hide();
    },
    stop() {
      $("#opacity_dropdown li").show();
      $(window).mouseup();
    },
    slide(evt, ui) {
      changeOpacity(ui);
    }
  });

  editor.buildMenu(
    "#zoom_dropdown",
    [
      { text: "1000%", value: "1000" },
      { text: "400%", value: "400" },
      { text: "200%", value: "200" },
      { text: "100%", value: "100" },
      { text: "50%", value: "50" },
      { text: "25%", value: "25" },
      { text: "Fit to canvas", value: "canvas" },
      { text: "Fit to selection", value: "selection" },
      { text: "Fit to all", value: "content" }
    ],
    function({ value: v, text }) {
      const value = Number.parseFloat(v);
      if (Number.isNaN(value)) {
        zoomChanged(window, v);
      } else {
        changeZoom({ value });
      }
    }
  );

  const clickFitCanvas = function() {
    zoomChanged(window, "canvas");
  };

  addAltDropDown(
    "#cur_linecap",
    "#linecap_opts",
    function() {
      setStrokeOpt(this, true);
    },
    { dropUp: true }
  );

  addAltDropDown(
    "#cur_linejoin",
    "#linejoin_opts",
    function() {
      setStrokeOpt(this, true);
    },
    { dropUp: true }
  );

  addAltDropDown(
    "#cur_start_marker_list",
    "#start_marker_list_opts",
    function() {
    },
    { dropUp: true }
  );

  addAltDropDown(
    "#cur_mid_marker_list",
    "#mid_marker_list_opts",
    function() {
    },
    { dropUp: true }
  );

  addAltDropDown(
    "#cur_end_marker_list",
    "#end_marker_list_opts",
    function() {
    },
    { dropUp: true }
  );

  $("#tool_position")
    .children("button")
    .each((i, b) => {
      $(b).click(() => {
        const letter = $(b)
          .data("action")
          .charAt(0);
        svgCanvas.alignSelectedElements(letter, "page");
      });
    });

  $("#toolbarFigures").dropdown();
  $("#toolbarPath").dropdown();
  $("#toolbarMerges").dropdown();
  $("#toolbarNew").dropdown();
  $("#slider-points").slider({
    min: 3,
    max: 25,
    step: 1,
    slide(e, ui) {
      changePoints(ui);
    }
  });

  /*

  When a flyout icon is selected
    (if flyout) {
    - Change the icon
    - Make pressing the button run its stuff
    }
    - Run its stuff

  When its shortcut key is pressed
    - If not current in list, do as above
    , else:
    - Just run its stuff

  */

  const clickRotate90Left = function() {
    const current = parseFloat($("#angle").val() || 0);
    svgCanvas.setRotationAngle(current - 90);
  };

  const clickRotate90Right = function() {
    const current = parseFloat($("#angle").val() || 0);
    svgCanvas.setRotationAngle(current + 90);
  };

  /**
   *
   * @returns {void}
   */
  const clickFHPath = function() {
    if (toolButtonClick("#tool_fhpath")) {
      svgCanvas.setMode("fhpath");
    }
  };

  /**
   *
   * @returns {void}
   */
  const clickLine = function() {
    if (toolButtonClick("#tool_line")) {
      svgCanvas.setMode("line");
    }
  };

  /**
   *
   * @returns {void}
   */
  const clickSquare = function() {
    if (toolButtonClick("#tool_square")) {
      svgCanvas.setMode("square");
    }
  };

  /**
   *
   * @returns {void}
   */
  const clickRect = function() {
    svgCanvas.setMode("rect");
    toolButtonClick("#tool_rect");
  };

  const clickInput = function() {
    svgCanvas.setMode("input");
    toolButtonClick("#tool_input");
  };

  /**
   *
   * @returns {void}
   */
  const clickFHRect = function() {
    if (toolButtonClick("#tool_fhrect")) {
      svgCanvas.setMode("fhrect");
    }
  };

  /**
   *
   * @returns {void}
   */
  const clickCircle = function() {
    if (toolButtonClick("#tool_circle")) {
      svgCanvas.setMode("circle");
    }
  };

  /**
   *
   * @returns {void}
   */
  const clickEllipse = function() {
    if (toolButtonClick("#tool_ellipse")) {
      svgCanvas.setMode("ellipse");
    }
  };

  /**
   *
   * @returns {void}
   */
  const clickFHEllipse = function() {
    if (toolButtonClick("#tool_fhellipse")) {
      svgCanvas.setMode("fhellipse");
    }
  };

  /**
   *
   * @returns {void}
   */
  const clickImage = function() {
    if (toolButtonClick("#tool_image")) {
      svgCanvas.setMode("image");
    }
  };

  /**
   *
   * @returns {void}
   */
  const clickZoom = function() {
    if (toolButtonClick("#tool_zoom")) {
      svgCanvas.setMode("zoom");
      workarea.css("cursor", zoomInIcon);
    }
  };

  /**
   * @param {Float} multiplier
   * @returns {void}
   */
  const zoomImage = function(multiplier) {
    const res = svgCanvas.getResolution();
    multiplier = multiplier ? res.zoom * multiplier : 1;
    // setResolution(res.w * multiplier, res.h * multiplier, true);
    $("#zoom").val(multiplier * 100);
    svgCanvas.setZoom(multiplier);
    zoomDone();
    updateCanvas(true);
  };

  /**
   *
   * @returns {void}
   */
  const dblclickZoom = function() {
    if (toolButtonClick("#tool_zoom")) {
      zoomImage();
      setSelectMode();
    }
  };

  /**
   *
   * @returns {void}
   */
  const clickText = function() {
    if (toolButtonClick("#tool_text")) {
      svgCanvas.setMode("text");
    }
  };

  /**
   *
   * @returns {void}
   */
  const clickPath = function() {
    if (toolButtonClick("#tool_path")) {
      svgCanvas.setMode("path");
    }
  };

  /**
   * Delete is a contextual tool that only appears in the ribbon if
   * an element has been selected.
   * @returns {void}
   */
  const deleteSelected = function() {
    if (!Utils.isNullish(selectedElement) || multiselected) {
      svgCanvas.deleteSelectedElements();
      populateElements();
    }
  };

  /**
   *
   * @returns {void}
   */
  const cutSelected = function() {
    if (!Utils.isNullish(selectedElement) || multiselected) {
      svgCanvas.cutSelectedElements();
    }
  };

  /**
   *
   * @returns {void}
   */
  const copySelected = function() {
    if (!Utils.isNullish(selectedElement) || multiselected) {
      svgCanvas.copySelectedElements();
    }
  };

  /**
   *
   * @returns {void}
   */
  const pasteInCenter = function() {
    const zoom = svgCanvas.getZoom();
    const x =
      (workarea[0].scrollLeft + workarea.width() / 2) / zoom -
      svgCanvas.contentW;
    const y =
      (workarea[0].scrollTop + workarea.height() / 2) / zoom -
      svgCanvas.contentH;
    svgCanvas.pasteElements("point", x, y);
  };

  /**
   *
   * @returns {void}
   */
  const moveToTopSelected = function() {
    svgCanvas.moveToTopSelectedElements();
    populateElements();
  };

  /**
   *
   * @returns {void}
   */
  const moveToBottomSelected = function() {
    svgCanvas.moveToBottomSelectedElements();
    populateElements();
  };

  /**
   * @param {"Up"|"Down"} dir
   * @returns {void}
   */
  const moveUpDownSelected = function(dir) {
    if (!Utils.isNullish(selectedElement)) {
      svgCanvas.moveUpDownSelected(dir);
      populateElements();
    }
  };

  /**
   *
   * @returns {void}
   */
  const convertToPath = function() {
    if (!Utils.isNullish(selectedElement)) {
      svgCanvas.convertToPath();
      populateElements();
    }
  };

  /**
   *
   * @returns {void}
   */
  const reorientPath = function() {
    if (!Utils.isNullish(selectedElement)) {
      path.reorient();
    }
  };

  /**
   *
   * @returns {Promise<void>} Resolves to `undefined`
   */
  const makeHyperlink = async function() {
    if (!Utils.isNullish(selectedElement) || multiselected) {
      const url = await $.prompt(
        uiStrings.notification.enterNewLinkURL,
        "http://"
      );
      if (url) {
        svgCanvas.makeHyperlink(url);
      }
    }
  };

  /**
   * @param {Float} dx
   * @param {Float} dy
   * @returns {void}
   */
  const moveSelected = function(dx, dy) {
    if (!Utils.isNullish(selectedElement) || multiselected) {
      if (curConfig.gridSnapping) {
        // Use grid snap value regardless of zoom level
        const multi = svgCanvas.getZoom() * curConfig.snappingStep;
        dx *= multi;
        dy *= multi;
      }
      svgCanvas.moveSelectedElements(dx, dy);
    }
  };

  /**
   *
   * @returns {void}
   */
  const linkControlPoints = function() {
    $("#tool_node_link").toggleClass("push_button_pressed tool_button");
    const linked = $("#tool_node_link").hasClass("push_button_pressed");
    path.linkControlPoints(linked);
  };

  /**
   *
   * @returns {void}
   */
  const clonePathNode = function() {
    if (path.getNodePoint()) {
      path.clonePathNode();
    }
  };

  /**
   *
   * @returns {void}
   */
  const deletePathNode = function() {
    if (path.getNodePoint()) {
      path.deletePathNode();
    }
  };

  /**
   *
   * @returns {void}
   */
  const addSubPath = function() {
    const button = $("#tool_add_subpath");
    const sp = !button.hasClass("push_button_pressed");
    button.toggleClass("push_button_pressed tool_button");
    path.addSubPath(sp);
  };

  /**
   *
   * @returns {void}
   */
  const opencloseSubPath = function() {
    path.opencloseSubPath();
  };

  /**
   *
   * @returns {void}
   */
  const selectNext = function() {
    svgCanvas.cycleElement(1);
  };

  /**
   *
   * @returns {void}
   */
  const selectPrev = function() {
    svgCanvas.cycleElement(0);
  };

  /**
   * @param {0|1} cw
   * @param {Integer} step
   * @returns {void}
   */
  const rotateSelected = function(cw, step) {
    if (Utils.isNullish(selectedElement) || multiselected) {
      return;
    }
    if (!cw) {
      step *= -1;
    }
    const angle = parseFloat($("#angle").val()) + step;
    svgCanvas.setRotationAngle(angle);
    updateContextPanel();
  };

  /**
   * @fires module:svgcanvas.SvgCanvas#event:ext_onNewDocument
   * @returns {Promise<void>} Resolves to `undefined`
   */
  const clickClear = async function() {
    const [x, y] = curConfig.dimensions;
    const ok = await $.confirm(uiStrings.notification.QwantToClear, {
      height: 135
    });
    if (!ok) {
      return;
    }
    setSelectMode();
    svgCanvas.clear();
    svgCanvas.setResolution(x, y);
    updateCanvas(true);
    zoomImage();
    populateLayers();
    updateContextPanel();
    prepPaints();
    svgCanvas.runExtensions("onNewDocument");
  };

  /**
   *
   * @returns {false}
   */
  const clickBold = function() {
    svgCanvas.setBold(!svgCanvas.getBold());
    updateContextPanel();
    return false;
  };

  const clickUnderline = function() {
    svgCanvas.setUnderline(!svgCanvas.getUnderline());
    updateContextPanel();
    return false;
  };

  const clickLineThrough = function() {
    svgCanvas.setLineThrough(!svgCanvas.getLineThrough());
    updateContextPanel();
    return false;
  };

  const clickTextAlignLeft = function() {
    svgCanvas.setAlignLeft(!svgCanvas.getAlignLeft());
    updateContextPanel();
    return false;
  }

  const clickTextAlignCenter = function() {
    svgCanvas.setAlignCenter(!svgCanvas.getAlignCenter());
    updateContextPanel();
    return false;
  }

  const clickTextAlignRight = function() {
    svgCanvas.setAlignRight(!svgCanvas.getAlignRight());
    updateContextPanel();
    return false;
  }

  /**
   *
   * @returns {false}
   */
  const clickItalic = function() {
    svgCanvas.setItalic(!svgCanvas.getItalic());
    updateContextPanel();
    return false;
  };

  /**
   *
   * @returns {void}
   */
  const clickSave = function() {
    // In the future, more options can be provided here
    const saveOpts = {
      images: editor.pref("img_save"),
      round_digits: 6
    };
    svgCanvas.save(saveOpts);
  };

  let loadingURL;
  /**
   *
   * @returns {Promise<void>} Resolves to `undefined`
   */
  const clickExport = async function() {
    const imgType = await $.select(
      "Select an image type for export: ",
      [
        // See http://kangax.github.io/jstests/toDataUrl_mime_type_test/ for a useful list of MIME types and browser support
        // 'ICO', // Todo: Find a way to preserve transparency in SVG-Edit if not working presently and do full packaging for x-icon; then switch back to position after 'PNG'
        "PNG",
        "JPEG",
        "BMP",
        "WEBP",
        "PDF"
      ],
      function() {
        const sel = $(this);
        if (sel.val() === "JPEG" || sel.val() === "WEBP") {
          if (!$("#image-slider").length) {
            $(`<div><label>${uiStrings.ui.quality}
              <input id="image-slider"
                type="range" min="1" max="100" value="92" />
            </label></div>`).appendTo(sel.parent());
          }
        } else {
          $("#image-slider")
            .parent()
            .remove();
        }
      }
    ); // todo: replace hard-coded msg with uiStrings.notification.
    if (!imgType) {
      return;
    }
    // Open placeholder window (prevents popup)
    let exportWindowName;

    /**
     *
     * @returns {void}
     */
    function openExportWindow() {
      const { loadingImage } = uiStrings.notification;
      if (curConfig.exportWindowType === "new") {
        editor.exportWindowCt++;
      }
      exportWindowName = curConfig.canvasName + editor.exportWindowCt;
      let popHTML, popURL;
      if (loadingURL) {
        popURL = loadingURL;
      } else {
        popHTML = `<!DOCTYPE html><html>
          <head>
            <meta charset="utf-8">
            <title>${loadingImage}</title>
          </head>
          <body><h1>${loadingImage}</h1></body>
        <html>`;
        if (typeof URL !== "undefined" && URL.createObjectURL) {
          const blob = new Blob([popHTML], { type: "text/html" });
          popURL = URL.createObjectURL(blob);
        } else {
          popURL =
            "data:text/html;base64;charset=utf-8," + Utils.encode64(popHTML);
        }
        loadingURL = popURL;
      }
      exportWindow = window.open(popURL, exportWindowName);
    }
    const chrome = isChrome();
    if (imgType === "PDF") {
      if (!customExportPDF && !chrome) {
        openExportWindow();
      }
      svgCanvas.exportPDF(exportWindowName);
    } else {
      if (!customExportImage) {
        openExportWindow();
      }
      const quality = parseInt($("#image-slider").val()) / 100;
      /* const results = */ await svgCanvas.rasterExport(
        imgType,
        quality,
        exportWindowName
      );
    }
  };

  /**
   * By default, svgCanvas.open() is a no-op. It is up to an extension
   *  mechanism (opera widget, etc.) to call `setCustomHandlers()` which
   *  will make it do something.
   * @returns {void}
   */
  const clickOpen = function() {
    svgCanvas.open();
  };

  /**
   *
   * @returns {void}
   */
  const clickImport = function() {
    /* */
  };

  /**
   *
   * @returns {void}
   */
  const clickUndo = function() {
    if (undoMgr.getUndoStackSize() > 0) {
      undoMgr.undo();
      populateLayers();
    }
  };

  /**
   *
   * @returns {void}
   */
  const clickRedo = function() {
    if (undoMgr.getRedoStackSize() > 0) {
      undoMgr.redo();
      populateLayers();
    }
  };

  /**
   *
   * @returns {void}
   */
  const clickFlipHorizonatal = function() {
    svgCanvas.flip("horizontal");
  };

  const clickFlipVertical = function() {
    svgCanvas.flip("vertical");
  };

  const clickGroup = function() {
    // group
    if (multiselected) {
      svgCanvas.groupSelectedElements();
      // ungroup
    } else if (selectedElement) {
      svgCanvas.ungroupSelectedElement();
    }

    populateElements();
  };

  const clickMergeUnion = function() {
    svgCanvas.merge("unite");
  };
  const clickMergeSubtract = function() {
    svgCanvas.merge("subtract");
  };
  const clickMergeIntersect = function() {
    svgCanvas.merge("intersect");
  };
  const clickMergeDifference = function() {
    svgCanvas.merge("exclude");
  };
  const clickMergeDivide = function() {
    svgCanvas.merge("divide");
  };
  const clickAnchor = function() {
    svgCanvas.resetAnchorSys();
  };
  const clickKnife = function() {
    if (svgCanvas.getSelectedElems().length > 0) {
      if (toolButtonClick("#tool_knife")) {
        svgCanvas.setMode("path");
        svgCanvas.setSubMode("knife");
      }
    }
  };

  /**
   *
   * @returns {void}
   */
  const clickClone = function() {
    svgCanvas.cloneSelectedElements(20, 20);
  };

  /**
   *
   * @returns {void}
   */
  const clickAlign = function() {
    const letter = this.id.replace("tool_align", "").charAt(0);
    svgCanvas.alignSelectedElements(letter, $("#align_relative_to").val());
  };

  /**
   *
   * @returns {void}
   */
  const clickWireframe = function() {
    $("#tool_wireframe").toggleClass("push_button_pressed tool_button");
    workarea.toggleClass("wireframe");

    if (supportsNonSS) {
      return;
    }
    const wfRules = $("#wireframe_rules");
    if (!wfRules.length) {
      /* wfRules = */ $('<style id="wireframe_rules"></style>').appendTo(
        "head"
      );
    } else {
      wfRules.empty();
    }

    updateWireFrame();
  };

  let docprops = false;
  let preferences = false;

  /**
   *
   * @returns {void}
   */
  const showDocProperties = function() {
    if (docprops) {
      return;
    }
    docprops = true;

    // This selects the correct radio button by using the array notation
    $("#image_save_opts input").val([editor.pref("img_save")]);

    // update resolution option with actual resolution
    const res = svgCanvas.getResolution();
    if (curConfig.baseUnit !== "px") {
      res.w = convertUnit(res.w) + curConfig.baseUnit;
      res.h = convertUnit(res.h) + curConfig.baseUnit;
    }

    $("#canvas_width").val(res.w);
    $("#canvas_height").val(res.h);
    $("#canvas_title").val(svgCanvas.getDocumentTitle());

    $("#svg_docprops").show();
  };

  /**
   *
   * @returns {void}
   */
  const showPreferences = function() {
    if (preferences) {
      return;
    }
    preferences = true;
    $("#main_menu").hide();

    // Update background color with current one
    const canvasBg = curPrefs.bkgd_color;
    const url = editor.pref("bkgd_url");
    blocks.each(function() {
      const blk = $(this);
      const isBg = blk.data("bgcolor") === canvasBg;
      blk.toggleClass(curBg, isBg);
    });
    if (!canvasBg) {
      blocks.eq(0).addClass(curBg);
    }
    if (url) {
      $("#canvas_bg_url").val(url);
    }
    $("#grid_snapping_on").prop("checked", curConfig.gridSnapping);
    $("#grid_snapping_step").attr("value", curConfig.snappingStep);
    $("#grid_color").attr("value", curConfig.gridColor);

    $("#svg_prefs").show();
  };

  /**
   *
   * @returns {void}
   */
  const openHomePage = function() {
    window.open(homePage, "_blank");
  };

  /**
   *
   * @returns {void}
   */
  const hideSourceEditor = function() {
    $("#svg_source_editor").hide();
    editingsource = false;
    $("#svg_source_textarea").blur();
  };

  /**
   *
   * @returns {Promise<void>} Resolves to `undefined`
   */
  const saveSourceEditor = async function() {
    if (!editingsource) {
      return;
    }

    const saveChanges = function() {
      svgCanvas.clearSelection();
      hideSourceEditor();
      zoomImage();
      populateLayers();
      updateTitle();
      prepPaints();
    };

    if (!svgCanvas.setSvgString($("#svg_source_textarea").val())) {
      const ok = await $.confirm(uiStrings.notification.QerrorsRevertToSource);
      if (!ok) {
        return;
      }
      saveChanges();
      return;
    }
    saveChanges();
    setSelectMode();
  };

  $("#canvas_width, #canvas_height").change(function() {
    saveDocProperties();
  });

  $("#resolution").change(function() {
    const values = $(this)
      .val()
      .split("x");
    if (values.length == 2) {
      $("#canvas_width").val(values[0]);
      $("#canvas_height").val(values[1]);
      saveDocProperties();
    }
  });

  $("#rotate_canvas").click(function() {
    const width = $("#canvas_width").val();
    $("#canvas_width").val($("#canvas_height").val());
    $("#canvas_height").val(width);
    saveDocProperties();
  });

  /**
   *
   * @returns {boolean} Whether there were problems saving the document properties
   */
  const saveDocProperties = function() {
    // set title
    const newTitle = $("#canvas_title").val() || "No title";
    updateTitle(newTitle);
    svgCanvas.setDocumentTitle(newTitle);

    // update resolution
    const width = $("#canvas_width"),
      w = width.val();
    const height = $("#canvas_height"),
      h = height.val();

    if (w !== "fit" && !isValidUnit("width", w)) {
      width.parent().addClass("error");
      /* await */ $.alert(uiStrings.notification.invalidAttrValGiven);
      return false;
    }

    width.parent().removeClass("error");

    if (h !== "fit" && !isValidUnit("height", h)) {
      height.parent().addClass("error");
      /* await */ $.alert(uiStrings.notification.invalidAttrValGiven);
      return false;
    }

    height.parent().removeClass("error");

    if (!svgCanvas.setResolution(w, h)) {
      /* await */ $.alert(uiStrings.notification.noContentToFitTo);
      return false;
    }

    // Set image save option
    // editor.pref("img_save", $("#image_save_opts :checked").val());
    updateCanvas();
    return true;
  };

  /**
   * Save user preferences based on current values in the UI.
   * @function module:SVGEditor.savePreferences
   * @returns {Promise<void>}
   */
  const savePreferences = (editor.savePreferences = async function() {
    // Set background
    const color = $("#bg_blocks div.cur_background").data("bgcolor") || "#FFF";
    setBackground(color, $("#canvas_bg_url").val());

    // set language
    const lang = $("#lang_select").val();
    if (lang && lang !== editor.pref("lang")) {
      const { langParam, langData } = await editor.putLocale(
        lang,
        goodLangs,
        curConfig
      );
      await setLang(langParam, langData);
    }

    // set icon size
    setIconSize($("#iconsize").val());

    // set grid setting
    curConfig.gridSnapping = $("#grid_snapping_on")[0].checked;
    curConfig.snappingStep = $("#grid_snapping_step").val();
    curConfig.gridColor = $("#grid_color").val();
    curConfig.showRulers = $("#show_rulers")[0].checked;

    $("#rulers").toggle(curConfig.showRulers);
    if (curConfig.showRulers) {
      updateRulers();
    }
    curConfig.baseUnit = $("#base_unit").val();

    svgCanvas.setConfig(curConfig);

    updateCanvas();
    hidePreferences();
  });

  let resetScrollPos = $.noop;

  /**
   *
   * @returns {Promise<void>} Resolves to `undefined`
   */
  const cancelOverlays = async function() {
    $("#dialog_box").hide();
    if (!editingsource && !docprops && !preferences) {
      if (curContext) {
        svgCanvas.leaveContext();
      }
      return;
    }

    if (editingsource) {
      if (origSource !== $("#svg_source_textarea").val()) {
        const ok = await $.confirm(uiStrings.notification.QignoreSourceChanges);
        if (ok) {
          hideSourceEditor();
        }
      } else {
        hideSourceEditor();
      }
    } else if (docprops) {
      hideDocProperties();
    } else if (preferences) {
      hidePreferences();
    }
    resetScrollPos();
  };

  const winWh = { width: $(window).width(), height: $(window).height() };

  // Fix for Issue 781: Drawing area jumps to top-left corner on window resize (IE9)
  if (isIE()) {
    resetScrollPos = function() {
      if (workarea[0].scrollLeft === 0 && workarea[0].scrollTop === 0) {
        workarea[0].scrollLeft = curScrollPos.left;
        workarea[0].scrollTop = curScrollPos.top;
      }
    };

    curScrollPos = {
      left: workarea[0].scrollLeft,
      top: workarea[0].scrollTop
    };

    $(window).resize(resetScrollPos);
    editor.ready(function() {
      // TODO: Find better way to detect when to do this to minimize
      // flickering effect
      return new Promise((resolve, reject) => {
        // eslint-disable-line promise/avoid-new
        setTimeout(function() {
          resetScrollPos();
          resolve();
        }, 500);
      });
    });

    workarea.scroll(function() {
      curScrollPos = {
        left: workarea[0].scrollLeft,
        top: workarea[0].scrollTop
      };
    });
  }

  $(window).resize(function(evt) {
    $.each(winWh, function(type, val) {
      const curval = $(window)[type]();
      workarea[0]["scroll" + (type === "width" ? "Left" : "Top")] -=
        (curval - val) / 2;
      winWh[type] = curval;
    });
  });

  workarea.scroll(function() {
    // TODO: jQuery's scrollLeft/Top() wouldn't require a null check
    if ($("#ruler_x").length) {
      $("#ruler_x")[0].scrollLeft = workarea[0].scrollLeft;
    }
    if ($("#ruler_y").length) {
      $("#ruler_y")[0].scrollTop = workarea[0].scrollTop;
    }
  });

  $("#url_notice").click(function() {
    /* await */ $.alert(this.title);
  });

  $("#change_image_url").click(promptImgURL);

  // added these event handlers for all the push buttons so they
  // behave more like buttons being pressed-in and not images
  (function() {
    const toolnames = [
      "clear",
      "open",
      "save",
      "source",
      "delete",
      "delete_multi",
      "paste",
      "clone",
      "clone_multi",
      "move_top",
      "move_bottom"
    ];
    const curClass = "tool_button_current";

    let allTools = "";

    $.each(toolnames, function(i, item) {
      allTools += (i ? "," : "") + "#tool_" + item;
    });

    $(allTools)
      .mousedown(function() {
        $(this).addClass(curClass);
      })
      .bind("mousedown mouseout", function() {
        $(this).removeClass(curClass);
      });

    $("#tool_undo, #tool_redo")
      .mousedown(function() {
        if (!$(this).hasClass("disabled")) {
          $(this).addClass(curClass);
        }
      })
      .bind("mousedown mouseout", function() {
        $(this).removeClass(curClass);
      });
  })();

  // switch modifier key in tooltips if mac
  // NOTE: This code is not used yet until I can figure out how to successfully bind ctrl/meta
  // in Opera and Chrome
  if (isMac() && !window.opera) {
    const shortcutButtons = [
      "tool_clear",
      "tool_save",
      "tool_source",
      "tool_undo",
      "tool_redo",
      "tool_clone"
    ];
    let i = shortcutButtons.length;
    while (i--) {
      const button = document.getElementById(shortcutButtons[i]);
      if (button) {
        const { title } = button;
        const index = title.indexOf("Ctrl+");
        button.title = [
          title.substr(0, index),
          "Cmd+",
          title.substr(index + 5)
        ].join("");
      }
    }
  }

  /**
   * @param {external:jQuery} elem
   * @todo Go back to the color boxes having white background-color and then setting
   *  background-image to none.png (otherwise partially transparent gradients look weird)
   * @returns {void}
   */
  const colorPicker = function(elem) {
    const picker = elem.attr("id") === "stroke_color" ? "stroke" : "fill";
    // const opacity = (picker == 'stroke' ? $('#stroke_opacity') : $('#fill_opacity'));
    const title =
      picker === "stroke"
        ? uiStrings.ui.pick_stroke_paint_opacity
        : uiStrings.ui.pick_fill_paint_opacity;
    // let wasNone = false; // Currently unused
    const pos = elem.offset();
    let { paint } = paintBox[picker];
    $("#color_picker")
      .css({
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        position: "absolute",
        zIndex: 100
      })
      .jGraduate(
        {
          paint,
          window: { pickerTitle: title },
          images: { clientPath: curConfig.jGraduatePath },
          newstop: "inverse"
        },
        function(p) {
          paint = new $.jGraduate.Paint(p);
          paintBox[picker].setPaint(paint);
          svgCanvas.setPaint(picker, paint);
          $("#color_picker").hide();
        },
        function(p1, p2) {
          $("#color_picker").hide();
        }
      );
  };

  /**
   * Paint box class.
   */
  class PaintBox {
    /**
     * @param {string|Element|external:jQuery} container
     * @param {"fill"} type
     */
    constructor(container, type, spinner) {
      const cur = curConfig[type === "fill" ? "initFill" : "initStroke"];
      // set up gradients to be used for the buttons
      const svgdocbox = new DOMParser().parseFromString(
        `<svg xmlns="http://www.w3.org/2000/svg">
          <ellipse fill="#${
            cur.color
          }" stroke="#dfdfdf" stroke-width="2" cx="13" cy="14" rx="12" ry="12" opacity="${
          cur.opacity
        }"></ellipse>
          <defs><linearGradient id="gradbox_${PaintBox.ctr++}"/></defs>
        </svg>`,
        "text/xml"
      );

      this.noColor = $(
        "<div class='no-color' style='display:none'></div>"
      ).appendTo(container);

      let docElem = svgdocbox.documentElement;
      docElem = $(container)[0].appendChild(document.importNode(docElem, true));
      docElem.setAttribute("width", 28);

      this.rect = docElem.firstElementChild;
      this.defs = docElem.getElementsByTagName("defs")[0];
      this.grad = this.defs.firstElementChild;
      this.paint = new $.jGraduate.Paint({ solidColor: cur.color });
      this.type = type;
      this.spinner = spinner;
    }

    setOpacity(v, apply, fromSpinner) {
      const paint = Object.assign({}, this.paint, {alpha: v});
      this.setPaint(paint, apply, fromSpinner);
    }

    setPaint(paint, apply, fromSpinner) {
      this.paint = paint;

      const ptype = paint.type;
      const opac = paint.alpha / 100;

      if (!fromSpinner && this.spinner) {
        this.spinner.SpinButton(paint.alpha);
      }

      if (opac) {
        this.noColor.hide();
        $(this.rect).show();

        let fillAttr = "none";
        switch (ptype) {
          case "solidColor":
            fillAttr =
              paint[ptype] !== "none" ? "#" + paint[ptype] : paint[ptype];
            break;
          case "linearGradient":
          case "radialGradient": {
            this.grad.remove();
            this.grad = this.defs.appendChild(paint[ptype]);
            const id = (this.grad.id = "gradbox_" + this.type);
            fillAttr = "url(#" + id + ")";
            break;
          }
        }

        this.rect.setAttribute("fill", fillAttr);
        this.rect.setAttribute("opacity", opac);
      } else {
        this.noColor.show();
        $(this.rect).hide();
      }

      if (apply) {
        svgCanvas.setColor(this.type, this._paintColor, true);
        svgCanvas.setPaintOpacity(this.type, opac, true);
      }
    }

    /**
     * @param {boolean} apply
     * @returns {void}
     */
    update(apply) {
      if (!selectedElement) {
        return;
      }

      const { type } = this;
      switch (selectedElement.tagName) {
        case "use":
        case "image":
        case "foreignObject":
          // These elements don't have fill or stroke, so don't change
          // the current value
          return;
        case "g":
        case "a": {
          const childs = selectedElement.getElementsByTagName("*");

          let gPaint = null;
          for (let i = 0, len = childs.length; i < len; i++) {
            const elem = childs[i];
            const p = elem.getAttribute(type);
            if (i === 0) {
              gPaint = p;
            } else if (gPaint !== p) {
              gPaint = null;
              break;
            }
          }

          if (gPaint === null) {
            // No common color, don't update anything
            this._paintColor = null;
            return;
          }
          this._paintColor = gPaint;
          this._paintOpacity = 1;
          break;
        }
        default: {
          this._paintOpacity = parseFloat(
            selectedElement.getAttribute(type + "-opacity")
          );
          if (isNaN(this._paintOpacity)) {
            this._paintOpacity = 1.0;
          }

          const defColor = type === "fill" ? "black" : "none";
          this._paintColor = selectedElement.getAttribute(type) || defColor;
        }
      }

      if (apply) {
        svgCanvas.setColor(type, this._paintColor, true);
        svgCanvas.setPaintOpacity(type, this._paintOpacity, true);
      }

      this._paintOpacity *= 100;

      const paint = getPaint(this._paintColor, this._paintOpacity, type);
      // update the rect inside #fill_color/#stroke_color
      this.setPaint(paint);
    }

    /**
     * @returns {void}
     */
    prep() {
      const ptype = this.paint.type;

      switch (ptype) {
        case "linearGradient":
        case "radialGradient": {
          const paint = new $.jGraduate.Paint({ copy: this.paint });
          svgCanvas.setPaint(this.type, paint);
          break;
        }
      }
    }
  }
  PaintBox.ctr = 0;

  paintBox.fill = new PaintBox("#fill_color", "fill", $("#group_fill_opacity"));
  paintBox.stroke = new PaintBox("#stroke_color", "stroke", $("#group_stroke_opacity"));

  $("#stroke_width").val(curConfig.initStroke.width);
  $("#group_opacity").val(curConfig.initOpacity * 100);

  // Use this SVG elem to test vectorEffect support
  const testEl = paintBox.fill.rect.cloneNode(false);
  testEl.setAttribute("style", "vector-effect:non-scaling-stroke");
  const supportsNonSS = testEl.style.vectorEffect === "non-scaling-stroke";
  testEl.removeAttribute("style");
  const svgdocbox = paintBox.fill.rect.ownerDocument;
  // Use this to test support for blur element. Seems to work to test support in Webkit
  const blurTest = svgdocbox.createElementNS(NS.SVG, "feGaussianBlur");
  if (blurTest.stdDeviationX === undefined) {
    $("#tool_blur").hide();
  }
  $(blurTest).remove();

  // Test for zoom icon support
  (function() {
    const pre = "-" + uaPrefix.toLowerCase() + "-zoom-";
    const zoom = pre + "in";
    workarea.css("cursor", zoom);
    if (workarea.css("cursor") === zoom) {
      zoomInIcon = zoom;
      zoomOutIcon = pre + "out";
    }
    workarea.css("cursor", "auto");
  })();

  // Test for embedImage support (use timeout to not interfere with page load)
  setTimeout(function() {
    svgCanvas.embedImage("images/image.png", function(datauri) {
      if (!datauri) {
        // Disable option
        $("#image_save_opts [value=embed]").attr("disabled", "disabled");
        $("#image_save_opts input").val(["ref"]);
        editor.pref("img_save", "ref");
        $("#image_opt_embed")
          .css("color", "#666")
          .attr("title", uiStrings.notification.featNotSupported);
      }
    });
  }, 1000);

  $("#fill_color, #tool_fill .icon_label").click(function() {
    colorPicker($("#fill_color"));
    updateToolButtonState();
  });

  $("#stroke_color, #tool_stroke .icon_label").click(function() {
    colorPicker($("#stroke_color"));
    updateToolButtonState();
  });

  $("#group_opacityLabel").click(function() {
    $("#opacity_dropdown button").mousedown();
    $(window).mouseup();
  });

  $("#zoomLabel").click(function() {
    $("#zoom_dropdown button").mousedown();
    $(window).mouseup();
  });

  $("#tool_move_top").mousedown(function(evt) {
    $("#tools_stacking").show();
    evt.preventDefault();
  });

  $(".layer_button")
    .mousedown(function() {
      $(this).addClass("layer_buttonpressed");
    })
    .mouseout(function() {
      $(this).removeClass("layer_buttonpressed");
    })
    .mouseup(function() {
      $(this).removeClass("layer_buttonpressed");
    });

  $(".push_button")
    .mousedown(function() {
      if (!$(this).hasClass("disabled")) {
        $(this)
          .addClass("push_button_pressed")
          .removeClass("push_button");
      }
    })
    .mouseout(function() {
      $(this)
        .removeClass("push_button_pressed")
        .addClass("push_button");
    })
    .mouseup(function() {
      $(this)
        .removeClass("push_button_pressed")
        .addClass("push_button");
    });

  $("#layer_new").click(async function() {
    let uniqName,
      i = svgCanvas.getCurrentDrawing().getNumLayers();
    do {
      uniqName = uiStrings.layers.layer + " " + ++i;
    } while (svgCanvas.getCurrentDrawing().hasLayer(uniqName));

    const newName = await $.prompt(
      uiStrings.notification.enterUniqueLayerName,
      uniqName,
      { height: 115 }
    );
    if (!newName) {
      return;
    }
    if (svgCanvas.getCurrentDrawing().hasLayer(newName)) {
      /* await */ $.alert(uiStrings.notification.dupeLayerName);
      return;
    }
    svgCanvas.createLayer(newName);
    updateContextPanel();
    populateLayers();
  });

  /**
   *
   * @returns {void}
   */
  function deleteLayer() {
    if (svgCanvas.deleteCurrentLayer()) {
      updateContextPanel();
      populateLayers();
      // This matches what SvgCanvas does
      // TODO: make this behavior less brittle (svg-editor should get which
      // layer is selected from the canvas and then select that one in the UI)
      $("#layerlist .layer-row").removeClass("layersel");
      $("#layerlist .layer-row:first").addClass("layersel");
    }
  }

  async function layerRename() {
    // const curIndex = $('#layerlist tr.layersel').prevAll().length; // Currently unused
    const oldName = $("#layerlist tr.layersel td.layername").text();
    const newName = await $.prompt(
      uiStrings.notification.enterNewLayerName,
      "",
      { height: 115 }
    );
    if (!newName) {
      return;
    }
    if (
      oldName === newName ||
      svgCanvas.getCurrentDrawing().hasLayer(newName)
    ) {
      /* await */ $.alert(uiStrings.notification.layerHasThatName);
      return;
    }

    svgCanvas.renameCurrentLayer(newName);
    populateLayers();
  }

  /**
   *
   * @returns {Promise<void>}
   */
  async function cloneLayer() {
    const name = svgCanvas.getCurrentDrawing().getCurrentLayerName() + " copy";

    const newName = await $.prompt(
      uiStrings.notification.enterUniqueLayerName,
      name,
      { height: 115 }
    );
    if (!newName) {
      return;
    }
    if (svgCanvas.getCurrentDrawing().hasLayer(newName)) {
      /* await */ $.alert(uiStrings.notification.dupeLayerName);
      return;
    }
    svgCanvas.cloneLayer(newName);
    updateContextPanel();
    populateLayers();
  }

  /**
   *
   * @returns {void}
   */
  function mergeLayer() {
    if (
      $("#layerlist tr.layersel").index() ===
      svgCanvas.getCurrentDrawing().getNumLayers() - 1
    ) {
      return;
    }
    svgCanvas.mergeLayer();
    updateContextPanel();
    populateLayers();
  }

  function moveElement(pos) {
    let curIndex = $("#elemlist .g-selected").index();
    if (curIndex >= 0 && pos != 0) {
      const maxIndex = $("#elemlist .layer-row").length - 1;
      if ((pos < 0 && curIndex == 0) || (pos > 0 && curIndex == maxIndex)) {
        return;
      }

      const firstElementInSelection = $("#elemlist .g-selected").first()[0];
      const lastElementInSelection = $("#elemlist .g-selected").last()[0];

      const firstSVGElem = $(
        `#${lastElementInSelection.id.substr("elem_".length)}`
      );
      const lastSVGElem = $(
        `#${firstElementInSelection.id.substr("elem_".length)}`
      );

      let elemToMove = pos > 0 ? firstSVGElem.prev() : lastSVGElem.next();
      if (elemToMove.length) {
        if (pos > 0) {
          elemToMove.detach().insertAfter(lastSVGElem);
        } else {
          elemToMove.detach().insertBefore(firstSVGElem);
        }
      }
    }
    populateElements();
  }

  function moveLayer(pos) {
    const total = svgCanvas.getCurrentDrawing().getNumLayers();

    let curIndex = $("#layerlist .g-selected").index();
    if (curIndex > 0 || curIndex < total - 1) {
      curIndex += pos;
      svgCanvas.setCurrentLayerPosition(total - curIndex - 1);
      populateLayers();
    }
  }

  $("#element_up").click(() => {
    moveElement(-1);
  });

  $("#element_down").click(() => {
    moveElement(1);
  });

  $("#move_elements").click(function() {
    if ($("#layerToMove").is(":visible")) {
      $("#layerToMove").hide();
      return;
    }

    const names = [];
    $("#layerlist .layer-row").each(function() {
      if (!$(this).hasClass("g-selected")) {
        names.push(
          $(this)
            .text()
            .trim()
        );
      }
    });
    $("#layerToMove").empty();

    const moveToLayer = function(e) {
      const layerName = $(e.target)
        .text()
        .trim();
      svgCanvas.moveSelectedToLayer(layerName);
      $("#layerToMove").hide();
      populateElements();
    };

    if (names.length > 0) {
      for (const name of names) {
        $(`<li class="g-menu-item has-icon" data-id="layer_merge_all">
      <span class="g-menu-item-icon"><i class="undefined"></i></span>
      <span class="g-menu-item-caption">${name}</span>
      </li>`)
          .appendTo("#layerToMove")
          .hover(
            function() {
              $(this).addClass("g-hover");
            },
            function() {
              $(this).removeClass("g-hover");
            }
          )
          .click(moveToLayer);
      }
    } else {
      $(`<li class="g-menu-item has-icon" data-id="layer_merge_all">
      <span class="g-menu-item-icon"><i class="undefined"></i></span>
      <span class="g-menu-item-caption"><i>No layers</i></span>
      </li>`).appendTo("#layerToMove");
    }

    $("#layerToMove").show();
  });

  $("#layer_delete").click(deleteLayer);

  $("#layer_up").click(() => {
    moveLayer(-1);
  });

  $("#layer_down").click(() => {
    moveLayer(1);
  });

  const SIDEPANEL_MAXWIDTH = 300;
  const SIDEPANEL_OPENWIDTH = 150;
  let sidedrag = -1,
    sidedragging = false,
    allowmove = false;

  /**
   * @param {Float} delta
   * @fires module:svgcanvas.SvgCanvas#event:ext_workareaResized
   * @returns {void}
   */
  const changeSidePanelWidth = function(delta) {
    const rulerX = $("#ruler_x");
    $("#sidepanels").width("+=" + delta);
    $("#layerpanel").width("+=" + delta);
    rulerX.css("right", parseInt(rulerX.css("right")) + delta);
    workarea.css("right", parseInt(workarea.css("right")) + delta);
    svgCanvas.runExtensions("workareaResized");
  };

  /**
   * @param {Event} evt
   * @returns {void}
   */
  const resizeSidePanel = function(evt) {
    if (!allowmove) {
      return;
    }
    if (sidedrag === -1) {
      return;
    }
    sidedragging = true;
    let deltaX = sidedrag - evt.pageX;
    const sideWidth = $("#sidepanels").width();
    if (sideWidth + deltaX > SIDEPANEL_MAXWIDTH) {
      deltaX = SIDEPANEL_MAXWIDTH - sideWidth;
      // sideWidth = SIDEPANEL_MAXWIDTH;
    } else if (sideWidth + deltaX < 2) {
      deltaX = 2 - sideWidth;
      // sideWidth = 2;
    }
    if (deltaX === 0) {
      return;
    }
    sidedrag -= deltaX;
    changeSidePanelWidth(deltaX);
  };

  /**
   * If width is non-zero, then fully close it; otherwise fully open it.
   * @param {boolean} close Forces the side panel closed
   * @returns {void}
   */
  const toggleSidePanel = function(close) {
    const dpr = window.devicePixelRatio || 1;
    const w = $("#sidepanels").width();
    const isOpened = (dpr < 1 ? w : w / dpr) > 2;
    const zoomAdjustedSidepanelWidth =
      (dpr < 1 ? 1 : dpr) * SIDEPANEL_OPENWIDTH;
    const deltaX = (isOpened || close ? 0 : zoomAdjustedSidepanelWidth) - w;
    changeSidePanelWidth(deltaX);
  };

  $("#sidepanel_handle")
    .mousedown(function(evt) {
      sidedrag = evt.pageX;
      $(window).mousemove(resizeSidePanel);
      allowmove = false;
      // Silly hack for Chrome, which always runs mousemove right after mousedown
      setTimeout(function() {
        allowmove = true;
      }, 20);
    })
    .mouseup(function(evt) {
      if (!sidedragging) {
        toggleSidePanel();
      }
      sidedrag = -1;
      sidedragging = false;
    });

  $(window).mouseup(function() {
    sidedrag = -1;
    sidedragging = false;
    $("#svg_editor").unbind("mousemove", resizeSidePanel);
  });

  populateLayers();

  // function changeResolution (x,y) {
  //   const {zoom} = svgCanvas.getResolution();
  //   setResolution(x * zoom, y * zoom);
  // }

  const centerCanvas = () => {
    // this centers the canvas vertically in the workarea (horizontal handled in CSS)
    workarea.css("line-height", workarea.height() + "px");
  };

  $(window).bind("load resize", centerCanvas);

  /**
   * @type {module:jQuerySpinButton.StepCallback}
   */
  function stepFontSize(elem, step) {
    const origVal = Number(elem.value);
    const sugVal = origVal + step;
    const increasing = sugVal >= origVal;
    if (step === 0) {
      return origVal;
    }

    if (origVal >= 24) {
      if (increasing) {
        return Math.round(origVal * 1.1);
      }
      return Math.round(origVal / 1.1);
    }
    if (origVal <= 1) {
      if (increasing) {
        return origVal * 2;
      }
      return origVal / 2;
    }
    return sugVal;
  }

  /**
   * @type {module:jQuerySpinButton.StepCallback}
   */
  function stepZoom(elem, step) {
    const origVal = Number(elem.value);
    if (origVal === 0) {
      return 100;
    }
    const sugVal = origVal + step;
    if (step === 0) {
      return origVal;
    }

    if (origVal >= 100) {
      return sugVal;
    }
    if (sugVal >= origVal) {
      return origVal * 2;
    }
    return origVal / 2;
  }

  // function setResolution (w, h, center) {
  //   updateCanvas();
  //   // w -= 0; h -= 0;
  //   // $('#svgcanvas').css({width: w, height: h});
  //   // $('#canvas_width').val(w);
  //   // $('#canvas_height').val(h);
  //   //
  //   // if (center) {
  //   //   const wArea = workarea;
  //   //   const scrollY = h/2 - wArea.height()/2;
  //   //   const scrollX = w/2 - wArea.width()/2;
  //   //   wArea[0].scrollTop = scrollY;
  //   //   wArea[0].scrollLeft = scrollX;
  //   // }
  // }

  $("#resolution").change(function() {
    const wh = $("#canvas_width,#canvas_height");
    if (!this.selectedIndex) {
      if ($("#canvas_width").val() === "fit") {
        wh.removeAttr("disabled").val(100);
      }
    } else if (this.value === "content") {
      wh.val("fit").attr("disabled", "disabled");
    } else {
      const dims = this.value.split("x");
      $("#canvas_width").val(dims[0]);
      $("#canvas_height").val(dims[1]);
      wh.removeAttr("disabled");
    }
  });

  // Prevent browser from erroneously repopulating fields
  $("input,select").attr("autocomplete", "off");

  const dialogSelectors = [
    "#tool_source_cancel",
    "#tool_docprops_cancel",
    "#tool_prefs_cancel",
    ".overlay"
  ];
  /* eslint-disable jsdoc/require-property */
  /**
   * Associate all button actions as well as non-button keyboard shortcuts.
   * @namespace {PlainObject} module:SVGEditor~Actions
   */
  const Actions = (function() {
    /* eslint-enable jsdoc/require-property */
    /**
     * @typedef {PlainObject} module:SVGEditor.ToolButton
     * @property {string} sel The CSS selector for the tool
     * @property {external:jQuery.Function} fn A handler to be attached to the `evt`
     * @property {string} evt The event for which the `fn` listener will be added
     * @property {module:SVGEditor.Key} [key] [key, preventDefault, NoDisableInInput]
     * @property {string} [parent] Selector
     * @property {boolean} [hidekey] Whether to show key value in title
     * @property {string} [icon] The button ID
     * @property {boolean} isDefault For flyout holders
     */
    /**
     *
     * @name module:SVGEditor~ToolButtons
     * @type {module:SVGEditor.ToolButton[]}
     */
    const toolButtons = [
      { sel: "#tool_select", fn: clickSelect, evt: "click", key: ["V", true] },
      { sel: "#tool_fhpath", fn: clickFHPath, evt: "click", key: ["Q", true] },
      {
        sel: "#tool_line",
        fn: clickLine,
        evt: "click",
        key: ["L", true],
        parent: "#tools_line",
        prepend: true
      },
      {
        sel: "#tool_rect",
        fn: clickRect,
        evt: "mouseup",
        key: ["R", true],
        parent: "#tools_rect",
        icon: "rect"
      },
      {
        sel: "#tool_input",
        fn: clickInput,
        evt: "mouseup",
      },
      {
        sel: "#tool_square",
        fn: clickSquare,
        evt: "mouseup",
        parent: "#tools_rect",
        icon: "square"
      },
      {
        sel: "#tool_fhrect",
        fn: clickFHRect,
        evt: "mouseup",
        parent: "#tools_rect",
        icon: "fh_rect"
      },
      {
        sel: "#tool_ellipse",
        fn: clickEllipse,
        evt: "mouseup",
        key: ["E", true],
        parent: "#tools_ellipse",
        icon: "ellipse"
      },
      {
        sel: "#tool_circle",
        fn: clickCircle,
        evt: "mouseup",
        parent: "#tools_ellipse",
        icon: "circle"
      },
      {
        sel: "#tool_fhellipse",
        fn: clickFHEllipse,
        evt: "mouseup",
        parent: "#tools_ellipse",
        icon: "fh_ellipse"
      },
      {
        sel: "#tool_fit_canvas",
        fn: clickFitCanvas,
        evt: "click",
        key: ["Z", true]
      },
      { sel: "#tool_path", fn: clickPath, evt: "click", key: ["P", true] },
      { sel: "#tool_text", fn: clickText, evt: "click", key: ["T", true] },
      { sel: "#tool_image", fn: clickImage, evt: "mouseup" },
      { sel: "#tool_clear", fn: clickClear, evt: "mouseup", key: ["N", true] },
      {
        sel: "#tool_save",
        fn() {
          if (editingsource) {
            saveSourceEditor();
          } else {
            clickSave();
          }
        },
        evt: "mouseup",
        key: ["S", true]
      },
      { sel: "#tool_export", fn: clickExport, evt: "mouseup" },
      { sel: "#tool_open", fn: clickOpen, evt: "mouseup", key: ["O", true] },
      { sel: "#tool_import", fn: clickImport, evt: "mouseup" },
      {
        sel: "#tool_source",
        fn: showSourceEditor,
        evt: "click",
        key: ["U", true]
      },
      {
        sel: "#tool_wireframe",
        fn: clickWireframe,
        evt: "click",
        key: ["F", true]
      },
      {
        key: ["esc", false, false],
        fn() {
          if (
            dialogSelectors.every(sel => {
              return $(sel + ":hidden").length;
            })
          ) {
            svgCanvas.clearSelection();
          }
        },
        hidekey: true
      },
      {
        sel: dialogSelectors.join(","),
        fn: cancelOverlays,
        evt: "click",
        key: ["esc", false, false],
        hidekey: true
      },
      { sel: "#tool_source_save", fn: saveSourceEditor, evt: "click" },
      { sel: "#tool_docprops_save", fn: saveDocProperties, evt: "click" },
      { sel: "#tool_docprops", fn: showDocProperties, evt: "click" },
      { sel: "#tool_prefs_save", fn: savePreferences, evt: "click" },
      { sel: "#tool_editor_prefs", fn: showPreferences, evt: "click" },
      { sel: "#tool_editor_homepage", fn: openHomePage, evt: "click" },
      {
        sel: "#tool_open",
        fn() {
          window.dispatchEvent(new CustomEvent("openImage"));
        },
        evt: "click"
      },
      {
        sel: "#tool_import",
        fn() {
          window.dispatchEvent(new CustomEvent("importImage"));
        },
        evt: "click"
      },
      {
        sel: "#tool_delete,#tool_delete_multi",
        fn: deleteSelected,
        evt: "click",
        key: ["del/backspace", true]
      },
      { sel: "#tool_reorient", fn: reorientPath, evt: "click" },
      { sel: "#tool_node_link", fn: linkControlPoints, evt: "click" },
      { sel: "#tool_node_clone", fn: clonePathNode, evt: "click" },
      { sel: "#tool_node_delete", fn: deletePathNode, evt: "click" },
      { sel: "#tool_openclose_path", fn: opencloseSubPath, evt: "click" },
      { sel: "#tool_add_subpath", fn: addSubPath, evt: "click" },
      {
        sel: "#tool_move_top",
        fn: moveToTopSelected,
        evt: "click",
        key: "ctrl+shift+]"
      },
      {
        sel: "#tool_move_bottom",
        fn: moveToBottomSelected,
        evt: "click",
        key: "ctrl+shift+["
      },
      { sel: "#tool_topath", fn: convertToPath, evt: "click" },
      {
        sel: "#tool_make_link,#tool_make_link_multi",
        fn: makeHyperlink,
        evt: "click"
      },
      { sel: "#tool_undo", fn: clickUndo, evt: "click" },
      { sel: "#tool_redo", fn: clickRedo, evt: "click" },
      {
        sel: "#tool_clone,#tool_clone_multi",
        fn: clickClone,
        evt: "click",
        key: ["D", true]
      },
      {
        sel: "#tool_group_elements",
        fn: clickGroup,
        evt: "click",
        key: ["G", true]
      },
      {
        sel: "#tool_flip_horizontal",
        fn: clickFlipHorizonatal,
        evt: "click"
      },
      {
        sel: "#tool_flip_vertical",
        fn: clickFlipVertical,
        evt: "click"
      },
      {
        sel: "#tool_rotate_90_left",
        fn: clickRotate90Left,
        evt: "click"
      },
      {
        sel: "#tool_rotate_90_right",
        fn: clickRotate90Right,
        evt: "click"
      },
      {
        sel: "#tool_merge_union",
        fn: clickMergeUnion,
        evt: "click"
      },
      {
        sel: "#tool_merge_subtract",
        fn: clickMergeSubtract,
        evt: "click"
      },
      {
        sel: "#tool_merge_difference",
        fn: clickMergeDifference,
        evt: "click"
      },
      {
        sel: "#tool_merge_intersect",
        fn: clickMergeIntersect,
        evt: "click"
      },
      {
        sel: "#tool_merge_divide",
        fn: clickMergeDivide,
        evt: "click"
      },
      {
        sel: "#tool_knife",
        fn: clickKnife,
        evt: "click"
      },
      {
        sel: "#tool_anchor",
        fn: clickAnchor,
        evt: "click"
      },
      { sel: "#tool_ungroup", fn: clickGroup, evt: "click" },
      { sel: "#tool_unlink_use", fn: clickGroup, evt: "click" },
      { sel: "[id^=tool_align]", fn: clickAlign, evt: "click" },
      // these two lines are required to make Opera work properly with the flyout mechanism
      // {sel: '#tools_rect_show', fn: clickRect, evt: 'click'},
      // {sel: '#tools_ellipse_show', fn: clickEllipse, evt: 'click'},
      { sel: "#tool_bold", fn: clickBold, evt: "mousedown" },
      { sel: "#tool_italic", fn: clickItalic, evt: "mousedown" },
      { sel: "#tool_underline", fn: clickUnderline, evt: "mousedown" },
      { sel: "#tool_text_align_left", fn: clickTextAlignLeft, evt: "mousedown" },
      { sel: "#tool_text_align_center", fn: clickTextAlignCenter, evt: "mousedown" },
      { sel: "#tool_text_align_right", fn: clickTextAlignRight, evt: "mousedown" },
      { sel: "#tool_line_through", fn: clickLineThrough, evt: "mousedown" },
      { sel: "#sidepanel_handle", fn: toggleSidePanel, key: ["X"] },
      { sel: "#copy_save_done", fn: cancelOverlays, evt: "click" },

      // Shortcuts not associated with buttons

      {
        key: "ctrl+left",
        fn() {
          rotateSelected(0, 1);
        }
      },
      {
        key: "ctrl+right",
        fn() {
          rotateSelected(1, 1);
        }
      },
      {
        key: "ctrl+shift+left",
        fn() {
          rotateSelected(0, 5);
        }
      },
      {
        key: "ctrl+shift+right",
        fn() {
          rotateSelected(1, 5);
        }
      },
      { key: "shift+O", fn: selectPrev },
      { key: "shift+P", fn: selectNext },
      {
        key: [modKey + "up", true],
        fn() {
          zoomImage(2);
        }
      },
      {
        key: [modKey + "down", true],
        fn() {
          zoomImage(0.5);
        }
      },
      {
        key: [modKey + "]", true],
        fn() {
          moveUpDownSelected("Up");
        }
      },
      {
        key: [modKey + "[", true],
        fn() {
          moveUpDownSelected("Down");
        }
      },
      {
        key: ["up", true],
        fn() {
          moveSelected(0, -1);
        }
      },
      {
        key: ["down", true],
        fn() {
          moveSelected(0, 1);
        }
      },
      {
        key: ["left", true],
        fn() {
          moveSelected(-1, 0);
        }
      },
      {
        key: ["right", true],
        fn() {
          moveSelected(1, 0);
        }
      },
      {
        key: "shift+up",
        fn() {
          moveSelected(0, -10);
        }
      },
      {
        key: "shift+down",
        fn() {
          moveSelected(0, 10);
        }
      },
      {
        key: "shift+left",
        fn() {
          moveSelected(-10, 0);
        }
      },
      {
        key: "shift+right",
        fn() {
          moveSelected(10, 0);
        }
      },
      {
        key: ["alt+up", true],
        fn() {
          svgCanvas.cloneSelectedElements(0, -1);
        }
      },
      {
        key: ["alt+down", true],
        fn() {
          svgCanvas.cloneSelectedElements(0, 1);
        }
      },
      {
        key: ["alt+left", true],
        fn() {
          svgCanvas.cloneSelectedElements(-1, 0);
        }
      },
      {
        key: ["alt+right", true],
        fn() {
          svgCanvas.cloneSelectedElements(1, 0);
        }
      },
      {
        key: ["alt+shift+up", true],
        fn() {
          svgCanvas.cloneSelectedElements(0, -10);
        }
      },
      {
        key: ["alt+shift+down", true],
        fn() {
          svgCanvas.cloneSelectedElements(0, 10);
        }
      },
      {
        key: ["alt+shift+left", true],
        fn() {
          svgCanvas.cloneSelectedElements(-10, 0);
        }
      },
      {
        key: ["alt+shift+right", true],
        fn() {
          svgCanvas.cloneSelectedElements(10, 0);
        }
      },
      {
        key: "a",
        fn() {
          svgCanvas.selectAllInCurrentLayer();
        }
      },
      {
        key: modKey + "a",
        fn() {
          svgCanvas.selectAllInCurrentLayer();
        }
      },

      // Standard shortcuts
      { key: modKey + "z", fn: clickUndo },
      { key: modKey + "shift+z", fn: clickRedo },
      { key: modKey + "y", fn: clickRedo },

      { key: modKey + "x", fn: cutSelected },
      { key: modKey + "c", fn: copySelected },
      { key: modKey + "v", fn: pasteInCenter }
    ];

    // Tooltips not directly associated with a single function
    const keyAssocs = {
      "4/Shift+4": "#tools_rect_show",
      "5/Shift+5": "#tools_ellipse_show"
    };

    return {
      /** @lends module:SVGEditor~Actions */
      /**
       * @returns {void}
       */
      setAll() {
        const flyouts = {};
        $.each(toolButtons, function(i, opts) {
          // Bind function to button
          let btn;
          if (opts.sel) {
            btn = $(opts.sel);
            if (!btn.length) {
              return true;
            } // Skip if markup does not exist
            if (opts.evt) {
              // `touch.js` changes `touchstart` to `mousedown`,
              //   so we must map tool button click events as well
              if (isTouch() && opts.evt === "click") {
                opts.evt = "mousedown";
              }
              btn[opts.evt](function(e) {
                opts.fn(e);
                updateContextPanel();
              });
            }

            // Add to parent flyout menu, if able to be displayed
            if (opts.parent && $(opts.parent + "_show").length) {
              let fH = $(opts.parent);
              if (!fH.length) {
                fH = makeFlyoutHolder(opts.parent.substr(1));
              }
              if (opts.prepend) {
                btn[0].style.margin = "initial";
              }
              fH[opts.prepend ? "prepend" : "append"](btn);

              if (!Array.isArray(flyouts[opts.parent])) {
                flyouts[opts.parent] = [];
              }
              flyouts[opts.parent].push(opts);
            }
          }

          // Bind function to shortcut key
          if (opts.key) {
            // Set shortcut based on options
            let keyval,
              // disInInp = true,
              pd = false;
            if (Array.isArray(opts.key)) {
              keyval = opts.key[0];
              if (opts.key.length > 1) {
                pd = opts.key[1];
              }
              // if (opts.key.length > 2) { disInInp = opts.key[2]; }
            } else {
              keyval = opts.key;
            }
            keyval = String(keyval);

            const { fn } = opts;
            $.each(keyval.split("/"), function(j, key) {
              $(document).bind("keydown", key, function(e) {
                fn();
                updateContextPanel();
                if (pd) {
                  e.preventDefault();
                }
                // Prevent default on ALL keys?
                return false;
              });
            });

            // Put shortcut in title
            if (opts.sel && !opts.hidekey && btn.attr("title")) {
              const newTitle =
                btn.attr("title").split("[")[0] + " (" + keyval + ")";
              keyAssocs[keyval] = opts.sel;
              // Disregard for menu items
              if (!btn.parents("#main_menu").length) {
                btn.attr("title", newTitle);
              }
            }
          }
          return true;
        });

        // Make 'return' keypress trigger the change event
        $(".attr_changer, #image_url").bind("keydown", "return", function(evt) {
          $(this).change();
          evt.preventDefault();
        });

        $(window)
          .bind("keydown", "tab", function(e) {
            if (uiContext === "canvas") {
              e.preventDefault();
              selectNext();
            }
          })
          .bind("keydown", "shift+tab", function(e) {
            if (uiContext === "canvas") {
              e.preventDefault();
              selectPrev();
            }
          });

        $("#tool_zoom").dblclick(dblclickZoom);
      },
      /**
       * @returns {void}
       */
      setTitles() {
        $.each(keyAssocs, function(keyval, sel) {
          const menu = $(sel).parents("#main_menu").length;

          $(sel).each(function() {
            let t;
            if (menu) {
              t = $(this)
                .text()
                .split(" [")[0];
            } else {
              t = this.title.split(" [")[0];
            }
            let keyStr = "";
            // Shift+Up
            $.each(keyval.split("/"), function(i, key) {
              const modBits = key.split("+");
              let mod = "";
              if (modBits.length > 1) {
                mod = modBits[0] + "+";
                key = modBits[1];
              }
              keyStr += (i ? "/" : "") + mod + (uiStrings["key_" + key] || key);
            });
            if (menu) {
              this.lastChild.textContent = t + " [" + keyStr + "]";
            } else {
              this.title = t + " [" + keyStr + "]";
            }
          });
        });
      },
      /**
       * @param {string} sel Selector to match
       * @returns {module:SVGEditor.ToolButton}
       */
      getButtonData(sel) {
        return Object.values(toolButtons).find(btn => {
          return btn.sel === sel;
        });
      }
    };
  })();

  // Select given tool
  editor.ready(function() {
    let tool;
    const itool = curConfig.initTool,
      container = $("#tools_left, #svg_editor .tools_flyout"),
      preTool = container.find("#tool_" + itool),
      regTool = container.find("#" + itool);
    if (preTool.length) {
      tool = preTool;
    } else if (regTool.length) {
      tool = regTool;
    } else {
      tool = $("#tool_select");
    }
    tool.click().mouseup();

    if (curConfig.wireframe) {
      $("#tool_wireframe").click();
    }

    if (curConfig.showlayers) {
      toggleSidePanel();
    }

    $("#rulers").toggle(Boolean(curConfig.showRulers));

    if (curConfig.showRulers) {
      $("#show_rulers").attr("checked", true);
    }

    if (curConfig.baseUnit) {
      $("#base_unit").val(curConfig.baseUnit);
    }

    if (curConfig.gridSnapping) {
      $("#grid_snapping_on").attr("checked", true);
    }

    if (curConfig.snappingStep) {
      $("#grid_snapping_step").val(curConfig.snappingStep);
    }

    if (curConfig.gridColor) {
      $("#grid_color").val(curConfig.gridColor);
    }
  });

  // init SpinButtons
  $("#rect_rx").SpinButton({
    min: 0,
    max: 1000,
    stateObj,
    callback: changeRectRadius
  });
  $("#stroke_width").SpinButton({
    min: 0,
    max: 99,
    smallStep: 0.1,
    stateObj,
    callback: changeStrokeWidth
  });
  $("#angle").SpinButton({
    min: -180,
    max: 180,
    step: 5,
    stateObj,
    callback: changeRotationAngle
  });
  $("#font_size").SpinButton({
    min: 5,
    stepfunc: stepFontSize,
    stateObj,
    callback: changeFontSize
  });
  $("#group_opacity").SpinButton({
    min: 0,
    max: 100,
    step: 5,
    stateObj,
    callback: changeOpacity,
    slider: "#group_opacity_slider"
  });
  $("#group_fill_opacity").SpinButton({
    min: 0,
    max: 100,
    step: 5,
    stateObj,
    callback: changeFillOpacity,
    slider: "#group_fill_opacity_slider"
  });
  $("#group_stroke_opacity").SpinButton({
    min: 0,
    max: 100,
    step: 5,
    stateObj,
    callback: changeStrokeOpacity,
    slider: "#group_stroke_opacity_slider"
  });
  $("#group_blur").SpinButton({
    min: 0,
    max: 10,
    step: 0.1,
    stateObj,
    callback: changeBlur,
    slider: "#group_blur_slider"
  });

  $("#zoom_dropdown")
    .siblings("button")
    .click(function() {
      const step = $(this).hasClass("left-attached") ? -5 : 5;
      const current = svgCanvas.getZoom() * 100;
      changeZoom({ value: Math.ceil(current + step) });
    });

  $("#input_name,#input_type").change(function() {
    svgCanvas.changeSelectedAttribute(this.id.replace("_", "-"), $(this).val());
  });

  $("#input_autocomplete").change(function() {
    svgCanvas.changeSelectedAttribute("input-autocomplete", this.checked);
  });

  $("#workarea").contextMenu(
    {
      menu: "cmenu_canvas",
      inSpeed: 0
    },
    function(action, el, pos) {
      switch (action) {
        case "delete":
          deleteSelected();
          break;
        case "cut":
          cutSelected();
          break;
        case "copy":
          copySelected();
          break;
        case "paste":
          svgCanvas.pasteElements();
          break;
        case "paste_in_place":
          svgCanvas.pasteElements("in_place");
          break;
        case "group":
        case "group_elements":
          svgCanvas.groupSelectedElements();
          break;
        case "ungroup":
          svgCanvas.ungroupSelectedElement();
          break;
        case "move_front":
          moveToTopSelected();
          break;
        case "move_up":
          moveUpDownSelected("Up");
          break;
        case "move_down":
          moveUpDownSelected("Down");
          break;
        case "move_back":
          moveToBottomSelected();
          break;
        default:
          if (hasCustomHandler(action)) {
            getCustomHandler(action).call();
          }
          break;
      }
    }
  );

  /**
   * Implements {@see module:jQueryContextMenu.jQueryContextMenuListener}.
   * @param {"dupe"|"delete"|"merge_down"|"merge_all"} action
   * @param {external:jQuery} el
   * @param {{x: Float, y: Float, docX: Float, docY: Float}} pos
   * @returns {void}
   */

  $("#layer_moreopts").dropdown({ hideButtons: true });

  $("#layer_merge_down").click(function() {
    mergeLayer();
  });

  $("#layer_merge_all").click(function() {
    svgCanvas.mergeAllLayers();
    updateContextPanel();
    populateLayers();
  });

  $("#layer_duplicate").click(function() {
    cloneLayer();
  });

  $(".contextMenu li").mousedown(function(ev) {
    ev.preventDefault();
  });

  $("#cmenu_canvas li").disableContextMenu();
  canvMenu.enableContextMenuItems("#delete,#cut,#copy");

  $("#left-sidebars .sidebar-option").click(function() {
    $("#left-sidebars .sidebar-option").removeClass("active");
    $("#left-sidebars .sidebar-container").hide();

    $(this).addClass("active");
    $(`#${$(this).data("tab")}`).show();
  })

  /**
   * @returns {void}
   */
  function enableOrDisableClipboard() {
    let svgeditClipboard;
    try {
      svgeditClipboard = localStorage.getItem("svgedit_clipboard");
    } catch (err) {}
    canvMenu[(svgeditClipboard ? "en" : "dis") + "ableContextMenuItems"](
      "#paste,#paste_in_place"
    );
  }
  enableOrDisableClipboard();

  window.addEventListener("storage", function(e) {
    if (e.key !== "svgedit_clipboard") {
      return;
    }

    enableOrDisableClipboard();
  });

  window.addEventListener("beforeunload", function(e) {
    // Suppress warning if page is empty
    if (undoMgr.getUndoStackSize() === 0) {
      editor.showSaveWarning = false;
    }

    // showSaveWarning is set to 'false' when the page is saved.
    if (!curConfig.no_save_warning && editor.showSaveWarning) {
      // Browser already asks question about closing the page
      e.returnValue = uiStrings.notification.unsavedChanges; // Firefox needs this when beforeunload set by addEventListener (even though message is not used)
      return uiStrings.notification.unsavedChanges;
    }
    return true;
  });

  /**
   * Expose the `uiStrings`.
   * @function module:SVGEditor.canvas.getUIStrings
   * @returns {module:SVGEditor.uiStrings}
   */
  editor.canvas.getUIStrings = function() {
    return uiStrings;
  };

  /**
   * @returns {Promise<boolean>} Resolves to boolean indicating `true` if there were no changes
   *  and `false` after the user confirms.
   */
  editor.openPrep = function() {
    $("#main_menu").hide();
    if (undoMgr.getUndoStackSize() === 0) {
      return true;
    }
    return $.confirm(uiStrings.notification.QwantToOpen);
  };

  /**
   *
   * @param {Event} e
   * @returns {void}
   */
  function onDragEnter(e) {
    e.stopPropagation();
    e.preventDefault();
    // and indicator should be displayed here, such as "drop files here"
  }

  /**
   *
   * @param {Event} e
   * @returns {void}
   */
  function onDragOver(e) {
    e.stopPropagation();
    e.preventDefault();
  }

  /**
   *
   * @param {Event} e
   * @returns {void}
   */
  function onDragLeave(e) {
    e.stopPropagation();
    e.preventDefault();
    // hypothetical indicator should be removed here
  }
  // Use HTML5 File API: http://www.w3.org/TR/FileAPI/
  // if browser has HTML5 File API support, then we will show the open menu item
  // and provide a file input to click. When that change event fires, it will
  // get the text contents of the file and send it to the canvas
  if (window.FileReader) {
    /**
     * @param {Event} e
     * @returns {void}
     */
    const importImage = function(e) {
      $.process_cancel(uiStrings.notification.loadingImage, { height: 134 });
      e.stopPropagation();
      e.preventDefault();
      $("#workarea").removeAttr("style");
      $("#main_menu").hide();
      const file = e.type === "drop" ? e.dataTransfer.files[0] : this.files[0];
      if (!file) {
        $("#dialog_box").hide();
        return;
      }
      /* if (file.type === 'application/pdf') { // Todo: Handle PDF imports

      }
      else */
      if (!file.type.includes("image")) {
        return;
      }
      // Detected an image
      // svg handling
      let reader;
      let box = null;
      const selectedElements = svgCanvas.getSelectedElems();
      if (
        selectedElements.length == 1 &&
        selectedElements[0].tagName == "image"
      ) {
        box = svgCanvas.getStrokedBBox([selectedElements[0]]);
      }
      if (file.type.includes('svg')) {
        svgCanvas.deleteSelectedElements();
        reader = new FileReader();
        reader.onloadend = function (ev) {
          const newElement = svgCanvas.importSvgString(ev.target.result, true);
          newElement.setAttribute("x", box.x);
          newElement.setAttribute("y", box.y);
          svgCanvas.ungroupSelectedElement();
          svgCanvas.ungroupSelectedElement();
          svgCanvas.groupSelectedElements();
          svgCanvas.alignSelectedElements('m', 'page');
          svgCanvas.alignSelectedElements('c', 'page');
          // highlight imported element, otherwise we get strange empty selectbox
          svgCanvas.selectOnly([newElement]);
          $('#dialog_box').hide();
        };
        reader.readAsText(file);
      } else {
        // bitmap handling
        reader = new FileReader();
        reader.onloadend = function({ target: { result } }) {
          const insertNewImage = function(width, height) {
            const newImage = box
              ? selectedElements[0]
              : svgCanvas.addSVGElementFromJson({
                  element: "image",
                  attr: {
                    x: 0,
                    y: 0,
                    width,
                    height,
                    id: svgCanvas.getNextId(),
                    style: "pointer-events:inherit"
                  }
                });
            svgCanvas.setHref(newImage, result);
            svgCanvas.selectOnly([newImage]);
            svgCanvas.alignSelectedElements("m", "page");
            svgCanvas.alignSelectedElements("c", "page");
            updateContextPanel();
            $("#dialog_box").hide();
          };
          // create dummy img so we know the default dimensions
          let imgWidth = 100;
          let imgHeight = 100;
          const img = new Image();
          img.style.opacity = 0;
          img.addEventListener("load", function() {
            imgWidth = img.offsetWidth || img.naturalWidth || img.width;
            imgHeight = img.offsetHeight || img.naturalHeight || img.height;
            insertNewImage(imgWidth, imgHeight);
          });
          img.src = result;
        };
        reader.readAsDataURL(file);
      }
    };

    workarea[0].addEventListener("dragenter", onDragEnter);
    workarea[0].addEventListener("dragover", onDragOver);
    workarea[0].addEventListener("dragleave", onDragLeave);
    workarea[0].addEventListener("drop", importImage);

    const open = $('<input type="file">').change(async function(e) {
      const ok = await editor.openPrep();
      if (!ok) {
        return;
      }
      svgCanvas.clear();
      if (this.files.length === 1) {
        $.process_cancel(uiStrings.notification.loadingImage, { height: 134 });
        const reader = new FileReader();
        reader.onloadend = async function({ target }) {
          await loadSvgString(target.result);
          updateCanvas();
        };
        reader.readAsText(this.files[0]);
      }
    });
    $("#tool_open").show();
    $(window).on("openImage", () => open.click());

    const imgImport = $('<input type="file">').change(importImage);
    $("#tool_import").show();
    $(window).on("importImage", () => imgImport.click());
  }

  updateCanvas(true);
  //  const revnums = 'svg-editor.js ($Rev$) ';
  //  revnums += svgCanvas.getVersion();
  //  $('#copyright')[0].setAttribute('title', revnums);

  const loadedExtensionNames = [];
  /**
   * @function module:SVGEditor.setLang
   * @param {string} lang The language code
   * @param {module:locale.LocaleStrings} allStrings See {@tutorial LocaleDocs}
   * @fires module:svgcanvas.SvgCanvas#event:ext_langReady
   * @fires module:svgcanvas.SvgCanvas#event:ext_langChanged
   * @returns {Promise<void>} A Promise which resolves to `undefined`
   */
  const setLang = (editor.setLang = async function(lang, allStrings) {
    editor.langChanged = true;
    editor.pref("lang", lang);
    $("#lang_select").val(lang);
    if (!allStrings) {
      return;
    }
    // Todo: Remove `allStrings.lang` property in locale in
    //   favor of just `lang`?
    document.documentElement.lang = allStrings.lang; // lang;
    // Todo: Add proper RTL Support!
    // Todo: Use RTL detection instead and take out of locales?
    // document.documentElement.dir = allStrings.dir;
    $.extend(uiStrings, allStrings);

    // const notif = allStrings.notification; // Currently unused
    // $.extend will only replace the given strings
    const oldLayerName = $("#layerlist tr.layersel td.layername").text();
    const renameLayer = oldLayerName === uiStrings.common.layer + " 1";

    svgCanvas.setUiStrings(allStrings);
    Actions.setTitles();

    if (renameLayer) {
      svgCanvas.renameCurrentLayer(uiStrings.common.layer + " 1");
      populateLayers();
    }

    // In case extensions loaded before the locale, now we execute a callback on them
    if (extsPreLang.length) {
      await Promise.all(
        extsPreLang.map(ext => {
          loadedExtensionNames.push(ext.name);
          return ext.langReady({
            lang,
            uiStrings,
            importLocale: getImportLocale({
              defaultLang: lang,
              defaultName: ext.name
            })
          });
        })
      );
      extsPreLang.length = 0;
    } else {
      loadedExtensionNames.forEach(loadedExtensionName => {
        svgCanvas.runExtension(
          loadedExtensionName,
          "langReady",
          /** @type {module:svgcanvas.SvgCanvas#event:ext_langReady} */ {
            lang,
            uiStrings,
            importLocale: getImportLocale({
              defaultLang: lang,
              defaultName: loadedExtensionName
            })
          }
        );
      });
    }
    svgCanvas.runExtensions(
      "langChanged",
      /** @type {module:svgcanvas.SvgCanvas#event:ext_langChanged} */ lang
    );
  });
  localeInit(
    /**
     * @implements {module:locale.LocaleEditorInit}
     */
    {
      /**
       * Gets an array of results from extensions with a `addLangData` method,
       * returning an object with a `data` property set to its locales (to be
       * merged with regular locales).
       * @param {string} langParam
       * @fires module:svgcanvas.SvgCanvas#event:ext_addLangData
       * @todo Can we forego this in favor of `langReady` (or forego `langReady`)?
       * @returns {module:locale.AddLangExtensionLocaleData[]}
       */
      addLangData(langParam) {
        return svgCanvas.runExtensions(
          "addLangData",
          /**
           * @function
           * @type {module:svgcanvas.ExtensionVarBuilder}
           * @param {string} name
           * @returns {module:svgcanvas.SvgCanvas#event:ext_addLangData}
           */
          name => {
            // We pass in a function as we don't know the extension name here when defining this `addLangData` method
            return {
              lang: langParam,
              importLocale: getImportLocale({
                defaultLang: langParam,
                defaultName: name
              })
            };
          },
          true
        );
      },
      curConfig
    }
  );
  // Load extensions
  // Bit of a hack to run extensions in local Opera/IE9
  if (document.location.protocol === "file:") {
    setTimeout(extAndLocaleFunc, 100);
  } else {
    // Returns a promise (if we wanted to fire 'extensions-loaded' event,
    //   potentially useful to hide interface as some extension locales
    //   are only available after this)
    extAndLocaleFunc();
  }
};

/**
 * @callback module:SVGEditor.ReadyCallback
 * @returns {Promise<void>|void}
 */
/**
 * Queues a callback to be invoked when the editor is ready (or
 *   to be invoked immediately if it is already ready--i.e.,
 *   if `runCallbacks` has been run).
 * @param {module:SVGEditor.ReadyCallback} cb Callback to be queued to invoke
 * @returns {Promise<ArbitraryCallbackResult>} Resolves when all callbacks, including the supplied have resolved
 */
editor.ready = function(cb) {
  // eslint-disable-line promise/prefer-await-to-callbacks
  return new Promise((resolve, reject) => {
    // eslint-disable-line promise/avoid-new
    if (isReady) {
      resolve(cb()); // eslint-disable-line callback-return, promise/prefer-await-to-callbacks
      return;
    }
    callbacks.push([cb, resolve, reject]);
  });
};

/**
 * Invokes the callbacks previous set by `svgEditor.ready`
 * @returns {Promise<void>} Resolves to `undefined` if all callbacks succeeded and rejects otherwise
 */
editor.runCallbacks = async function() {
  try {
    await Promise.all(
      callbacks.map(([cb]) => {
        return cb(); // eslint-disable-line promise/prefer-await-to-callbacks
      })
    );
  } catch (err) {
    callbacks.forEach(([, , reject]) => {
      reject();
    });
    throw err;
  }
  callbacks.forEach(([, resolve]) => {
    resolve();
  });
  isReady = true;
};

/**
 * @param {string} str The SVG string to load
 * @param {PlainObject} [opts={}]
 * @param {boolean} [opts.noAlert=false] Option to avoid alert to user and instead get rejected promise
 * @returns {Promise<void>}
 */
editor.loadFromString = function(str, { noAlert } = {}) {
  return editor.ready(async function() {
    try {
      await loadSvgString(str, { noAlert });
    } catch (err) {
      if (noAlert) {
        throw err;
      }
    }
  });
};

/**
 * Not presently in use.
 * @param {PlainObject} featList
 * @returns {void}
 */
editor.disableUI = function(featList) {
  // $(function () {
  //   $('#tool_wireframe, #tool_image, #main_button, #tool_source, #sidepanels').remove();
  //   $('#tools_top').css('left', 5);
  // });
};

/**
 * @callback module:SVGEditor.URLLoadCallback
 * @param {boolean} success
 * @returns {void}
 */
/**
 * @param {string} url URL from which to load an SVG string via Ajax
 * @param {PlainObject} [opts={}] May contain properties: `cache`, `callback`
 * @param {boolean} [opts.cache]
 * @param {boolean} [opts.noAlert]
 * @returns {Promise<void>} Resolves to `undefined` or rejects upon bad loading of
 *   the SVG (or upon failure to parse the loaded string) when `noAlert` is
 *   enabled
 */
editor.loadFromURL = function(url, { cache, noAlert } = {}) {
  return editor.ready(function() {
    return new Promise((resolve, reject) => {
      // eslint-disable-line promise/avoid-new
      $.ajax({
        url,
        dataType: "text",
        cache: Boolean(cache),
        beforeSend() {
          $.process_cancel(uiStrings.notification.loadingImage);
        },
        success(str) {
          resolve(loadSvgString(str, { noAlert }));
        },
        error(xhr, stat, err) {
          if (xhr.status !== 404 && xhr.responseText) {
            resolve(loadSvgString(xhr.responseText, { noAlert }));
            return;
          }
          if (noAlert) {
            reject(new Error("URLLoadFail"));
            return;
          }
          $.alert(uiStrings.notification.URLLoadFail + ": \n" + err);
          resolve();
        },
        complete() {
          $("#dialog_box").hide();
        }
      });
    });
  });
};

/**
 * @param {string} str The Data URI to base64-decode (if relevant) and load
 * @param {PlainObject} [opts={}]
 * @param {boolean} [opts.noAlert]
 * @returns {Promise<void>} Resolves to `undefined` and rejects if loading SVG string fails and `noAlert` is enabled
 */
editor.loadFromDataURI = function(str, { noAlert } = {}) {
  return editor.ready(function() {
    let base64 = false;
    let pre = str.match(/^data:image\/svg\+xml;base64,/);
    if (pre) {
      base64 = true;
    } else {
      pre = str.match(/^data:image\/svg\+xml(?:;|;utf8)?,/);
    }
    if (pre) {
      pre = pre[0];
    }
    const src = str.slice(pre.length);
    return loadSvgString(
      base64 ? Utils.decode64(src) : decodeURIComponent(src),
      { noAlert }
    );
  });
};

/**
 * @param {string} name Used internally; no need for i18n.
 * @param {module:svgcanvas.ExtensionInitCallback} init Config to be invoked on this module
 * @param {module:svgcanvas.ExtensionInitArgs} initArgs
 * @throws {Error} If called too early
 * @returns {Promise<void>} Resolves to `undefined`
 */
editor.addExtension = function(name, init, initArgs) {
  // Note that we don't want this on editor.ready since some extensions
  // may want to run before then (like server_opensave).
  // $(function () {
  if (!svgCanvas) {
    throw new Error("Extension added too early");
  }
  return svgCanvas.addExtension.call(this, name, init, initArgs);
  // });
};

// Defer injection to wait out initial menu processing. This probably goes
//    away once all context menu behavior is brought to context menu.
editor.ready(() => {
  injectExtendedContextMenuItemsIntoDom();
});

let extensionsAdded = false;
const messageQueue = [];
/**
 * @param {PlainObject} info
 * @param {any} info.data
 * @param {string} info.origin
 * @fires module:svgcanvas.SvgCanvas#event:message
 * @returns {void}
 */
const messageListener = ({ data, origin }) => {
  // eslint-disable-line no-shadow
  // console.log('data, origin, extensionsAdded', data, origin, extensionsAdded);
  const messageObj = { data, origin };
  if (!extensionsAdded) {
    messageQueue.push(messageObj);
  } else {
    // Extensions can handle messages at this stage with their own
    //  canvas `message` listeners
    svgCanvas.call("message", messageObj);
  }
};
window.addEventListener("message", messageListener);

// Run init once DOM is loaded
// jQuery(editor.init);
export default editor;
