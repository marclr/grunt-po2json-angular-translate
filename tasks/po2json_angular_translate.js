/*
 * grunt-po2json-angular-translate
 * https://github.com/root/grunt-po2json-angular-translate
 *
 * Copyright (c) 2013 danielavalero, marclr
 * Licensed under the MIT license.
 */

'use strict';

var po = require('pofile');
var path = require('path');
var fs = require('fs');

//Taken from https://gist.github.com/liangzan/807712#comment-337828
var  rmDir = function (dirPath) {
  var files;
  try {
    files  = fs.readdirSync(dirPath);
  }
  catch (e) {
    return;
  }

  if (files.length > 0) {
    for (var i = 0; i < files.length; i++) {
      var filePath = dirPath + '/' + files[i];
      if (fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
      } else {
        rmDir(filePath);
      }
    }

    fs.rmdirSync(dirPath);
  }
};

module.exports = function (grunt) {

  var getValidFilepaths = function (filepaths) {
      /**
       * Function to warn and remove all invalid source files
       *
       * @param  {Array} filepaths list with all filepaths that will be checked if exists
       * @return {Array}          List with all valid files
       */
      var validFilepaths = filepaths.filter(function (filepath) {
        if (!grunt.file.exists(filepath)) {
          grunt.log.warn('Po file "' + filepath + '" not found.');
          return false;
        } else {
          return true;
        }
      });

      return validFilepaths;
    };

  var getFolderStructure = function (source) {
      var folderStructure = [];

      source.forEach(function (entry) {
        var segments = entry.split('**');

        if (segments.length > 2) {
          grunt.log.error('The path (' + entry + ') has multiple choices');
          return false;
        }

        folderStructure.push(segments);
      });

      return folderStructure;
    };

  var replacePlaceholder = function (string, openingMark, closingMark, altEnabled, isPluralString) {
    //if string is empty skip it
    if (string == '') {
      return;
    }

    if (closingMark !== undefined && altEnabled && string.indexOf(closingMark !== -1)) {
      if (string.indexOf(openingMark) !== -1) {
        if (isPluralString) {
          string = string.replace(openingMark, '{{');
        } else {
          string = string.replace(new RegExp(openingMark, 'g'), '{{');
        }
      }

      if (string.indexOf(closingMark) !== -1) {
        if (isPluralString) {
          string = string.replace(closingMark, '}}');
        } else {
          string = string.replace(new RegExp(closingMark, 'g'), '}}');
        }
      }
    }

    //If there is no closing mark, then we have standard format: %0,
    if (string.indexOf(closingMark === -1)) {
      var pattern = '\\%([0-9]|[a-z])';
      var re = new RegExp(pattern, 'g');
      var index = string.indexOf(re);
      var substr = string.substr(index, index + 2);
      string = string.replace(re, '{{' + substr + '}}');
    }

    return string;
  };

  var readPoFile = function (filepath, options, singleFile, singleFileStrings) {
  // Read the file po content
  var file = grunt.file.read(filepath);
  var catalog = po.parse(file);
  var strings = {};

  for (var i = 0; i < catalog.items.length; i++) {
    var item = catalog.items[i];
    if (options.upperCaseId) {
      item.msgid = item.msgid.toUpperCase();
    }

    if (item.msgidPlural !== null && item.msgstr.length > 1) {
      var singularWords = item.msgstr[0].split(' ');
      var pluralWords = item.msgstr[1].split(' ');
      var pluralizedStr = '';
      var numberPlaceHolder = false;

      if (singularWords.length !== pluralWords.length) {
        grunt.log.writeln('Either the singular or plural string had more words in the msgid: ' + item.msgid + ', the extra words were omitted');
      }

      for (var x = 0; x < singularWords.length; x++) {

        if (singularWords[x] === undefined || pluralWords[x] === undefined) {
          continue;
        }

        if (pluralWords[x].indexOf('%d') !== -1) {
          numberPlaceHolder = true;
          continue;
        }

        if (singularWords[x] !== pluralWords[x]) {
          var p = '';
          if (numberPlaceHolder) {
            p = '# ';
            numberPlaceHolder = false;
          }

          var strPl = 'PLURALIZE, plural, offset:' + options.offset;

          pluralizedStr += '{' + strPl + ' =2{' + p + singularWords[x] + '}' +
              ' other{' + p + pluralWords[x] + '}}';

        }else {
          pluralizedStr += singularWords[x];
        }

        if (x !== singularWords.length - 1) {
          pluralizedStr += ' ';
        }
      }

      pluralizedStr = replacePlaceholder(pluralizedStr, options.placeholderStructure[0], options.placeholderStructure[1], options.enableAltPlaceholders, true);
      strings[item.msgid] = pluralizedStr;
      if (singleFile) {
        singleFileStrings[item.msgid] =  pluralizedStr;
      }

    } else {
      var message = item.msgstr.length === 1 ? item.msgstr[0] : item.msgstr;
      message = replacePlaceholder(message, options.placeholderStructure[0], options.placeholderStructure[1], options.enableAltPlaceholders);
      strings[item.msgid] = message;
      if (singleFile) {
        singleFileStrings[item.msgid] = message;
      }
    }
  }

  return strings;
};

  grunt.registerMultiTask('po2json_angular_translate', 'grunt plugin to convert po to angangular-translate format', function () {
    var options = this.options({
      pretty: false,
      fuzzy: false,
      cleanPrevStrings: false,
      upperCaseId: false,
      stringify: true,
      offset: 1,
      enableAltPlaceholders: true,
      placeholderStructure: ['{', '}'],
      maintainFolderStructure: false
    });

    var files = this.files;
    files.forEach(function (file) {
      // file.src contains the expanded folder
      // file.orig contains the literal

      var f = file;
      var filelist = file.src;
      var destination = file.dest;
      var filepaths = getValidFilepaths(filelist);

      if (filepaths.length === 0) {
        grunt.log.warn('Destination (' + destination + ') not written because src files were empty.');
        return;
      }

      if (options.cleanPrevStrings) {
        rmDir(destination);
      }

      //If destination is a file, we should put everything there
      var singleFile = false;
      var singleFileStrings = {};
      var destPath = path.extname(destination);
      if (destPath !== '') {
        singleFile = true;
      }

      var startSourcePath = [];
      if (options.maintainFolderStructure) {
        var source = file.orig.src;
        startSourcePath = getFolderStructure(source);

        var dest = file.orig.dest;
        var startDestPath = dest.split('**');
        if (startDestPath.length > 2) {
          grunt.log.writeln('Dest (' + dest + ') path has multiple choices');
          return false;
        }
      }

      // Let's do the job!
      var fileOutput = destination;
      filepaths.forEach(function (filepath) {
        if (!singleFile) {
          // Prepare the file name
          var filename = path.basename(filepath, path.extname(filepath));

          if (options.maintainFolderStructure) {
            var find = false;
            for (var pos = 0; pos < startSourcePath.length && !find; pos++) {
              var index = startSourcePath[pos][0];
              if (filepath.indexOf(index) === 0) {
                //Build path based on source
                var middlePath = path.dirname(filepath.replace(index, ''));
                fileOutput = path.join(startDestPath[0], middlePath, filename + '.json');
                find = true;
              } else if (path.dirname(filepath) === path.dirname(index)) {
                //The source and the destination doesn't have '**' build typical structure
                fileOutput = path.join(destination, filename + '.json');
                find = true;
              }
            }
          } else {
            fileOutput = path.join(destination, filename + '.json');
          }
        }

        //The singleFileStrings will be passed by reference
        var strings = readPoFile(filepath, options, singleFile, singleFileStrings);

        if (!singleFile) {
          grunt.file.write(fileOutput, (options.stringify) ? JSON.stringify(strings, null, (options.pretty) ? '   ' : '') : strings);
          grunt.log.writeln('JSON file(s) created: "' + fileOutput + '"');
        }

      });

      if (singleFile) {
        grunt.file.write(destination, (options.stringify) ? JSON.stringify(singleFileStrings, null, (options.pretty) ? '   ' : '') : singleFileStrings);
        grunt.log.writeln('JSON file(s) created: "' + destination + '"');
      }
    });
  });

};
