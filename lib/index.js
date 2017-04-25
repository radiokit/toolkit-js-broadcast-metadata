"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var MetadataListener_1 = require("./MetadataListener");
exports.MetadataListener = MetadataListener_1.MetadataListener;
function exportWindow(path, exported) {
    if (typeof (window) !== 'undefined') {
        var current = window;
        for (var i = 0; i < path.length; i++) {
            if (current.hasOwnProperty(path[i])) {
                if (typeof (current[path[i]]) === 'object') {
                    current = current[path[i]];
                }
                else {
                    throw new Error("Unable to export window." + path.join('.') + ": window." + path.slice(0, i + 1).join('.') + " already exists but it is an " + typeof (current) + " instead of Object");
                }
            }
            else {
                if (i === path.length - 1) {
                    current[path[i]] = exported;
                }
                else {
                    current[path[i]] = {};
                }
                current = current[path[i]];
            }
        }
    }
}
exportWindow(['RadioKit', 'Toolkit', 'Broadcast', 'Metadata'], { MetadataListener: MetadataListener_1.MetadataListener });
