import { MetadataListener } from './MetadataListener';

function exportWindow(path, exported) {
  if(typeof(window) !== 'undefined') {
    let current = window;

    for(let i = 0; i < path.length; i++) {
      if(current.hasOwnProperty(path[i])) {
        if(typeof(current[path[i]]) === 'object') {
          current = current[path[i]];

        } else {
          throw new Error(`Unable to export window.${path.join('.')}: window.${path.slice(0, i+1).join('.')} already exists but it is an ${typeof(current)} instead of Object`);
        }

      } else {
        if(i === path.length - 1) {
          current[path[i]] = exported;
        } else {
          current[path[i]] = {};
        }
        current = current[path[i]];
      }
    }
  }
}


export { MetadataListener };
exportWindow(['RadioKit', 'Toolkit', 'Broadcast', 'Metadata'], { MetadataListener });

