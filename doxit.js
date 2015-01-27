var fs = require('fs'),
    path = require('path');

var glob = require('glob'),
    dox = require('dox'),
    extend = require('node.extend');

var DoxitGroup = require('./modules/doxitGroup'),
    FireTPL = require('firetpl');

/**
 * Doxit document parser
 * @module Doxit parser
 */
module.exports = (function() {
    'use strict';

    /**
     * Doxit parser module
     * @constructor
     */
    var Doxit = function() {
        this.templateFile = path.join(__dirname, 'templates/lagoon/index.fire');
        this.registerMapperFuncs();
    };

    /**
     * Registers pagger functions
     */
    Doxit.prototype.registerMapperFuncs = function() {
        this.__mapperFuncs = {
            'js': require('./mapper/javascript.js'),
            'css': require('./mapper/css.js'),
            'less': require('./mapper/css.js')
        };
    };

    /**
     * Calls a mapper function
     * @param  {string} mapperKey File extension
     * @param  {object} data      Data to be passed to the mapper function
     */
    Doxit.prototype.callMapperFunc = function(mapperKey, thisValue, data) {
        mapperKey = mapperKey.replace(/^\./, '');
        var fn = this.__mapperFuncs[mapperKey];
        fn.call(thisValue, data);
    };

    Doxit.prototype.readFiles = function(files) {
        var options = {
            nodir: true
        };

        var doxFiles = [];

        if (typeof files === 'string') {
            files = [files];
        }

        files.forEach(function(file) {
            doxFiles = doxFiles.concat(glob.sync(file, options));
        });

        doxFiles = doxFiles.filter(function(file) {
            return !/\/node_modules\//.test(file);
        });

        // console.log(doxFiles);
        var res = files.map(this.parseFile.bind(this));
        return this.mapDoxResult(res);
    };

    Doxit.prototype.parse = function(type, files) {
        var result = this.readFiles(files);

        if (type === 'json') {
            return JSON.stringify(result, null, '    ');
        }

        var tmpl = fs.readFileSync(this.templateFile);
        return FireTPL.fire2html(tmpl, result);
    };

    Doxit.prototype.parseString = function(type, filename, string) {
        var result = this.mapDoxResult([{
            file: filename,
            data: dox.parseComments(string)
        }]);

        if (type === 'json') {
            return JSON.stringify(result, null, '    ');
        }
        else if (type === 'raw') {
            return result;
        }

        var tmpl = fs.readFileSync(this.templateFile);
        return FireTPL.fire2html(tmpl, result);
    };

    /**
     * Parse a single file and returns the result
     * @param  {String} file filepath
     * @return {Object}      Returns a dox result
     */
    Doxit.prototype.parseFile = function(file) {
        var filepath = path.join(process.cwd(), file);
        var doxed = {
            file: file,
            data: dox.parseComments(fs.readFileSync(filepath, { encoding: 'utf8' }))
        };
        
        return doxed;
    };

    Doxit.prototype.mapDoxResult = function(doxed) {
        // fs.writeFile('dev-doxblock.json', JSON.stringify(doxed, true, '    '));

        var result = this.getMetaInfos();
        this.listing = [];
        doxed.forEach(function(doxFile) {
            var moduleName = doxFile.file;
            doxFile.ext = path.extname(doxFile.file);

            var data = doxFile.data.map(function(doxBlock) {
                var block = {};
                
                if (doxBlock.ignore) {
                    return;
                }

                fs.appendFileSync('dev-doxblock.json', 'Doxed block: ' + JSON.stringify(doxBlock, true, '    ') + '\n\n');

                block = this.parseTags(doxBlock);
                block.description = doxBlock.description;
                block.line = doxBlock.line;
                block.codeStart = doxBlock.codeStart;
                block.code = doxBlock.code;

                var res = extend(doxBlock, {
                    tagsArray: doxBlock.tags || [],
                });

                //Is module?
                if (res.tags.module) {
                    moduleName = res.tags.module;
                    return;
                }

                var groupName = moduleName;

                //Has @group tag
                if (doxBlock.group) {
                    groupName = doxBlock.group;
                }

                //Is method (js only)?
                // if (doxFile.ext === '.js') {
                //     if (doxBlock.ctx.type === 'method') {
                //         block.method = block.method || doxBlock.ctx.name;
                //     }
                // }

                fs.appendFileSync('dev-doxblock.json', 'Mapped to: ' + JSON.stringify(block, true, '    ') + '\n\n');
                
                return block;
            }.bind(this));
            
            var res = {
                file: doxFile.file,
                setGroup: this.setGroup.bind(this),
                grepPattern: this.grepPattern.bind(this),
                grepDataTypes: this.grepDataTypes.bind(this)
            };
            
            this.callMapperFunc(path.extname(doxFile.file), res, data);
        }.bind(this));

        result.listing = this.listing.map(function(listing) {
            listing.link = listing.name.replace(/\W+/g, '');
            listing.groups.forEach(function(group) {
                group.link = listing.link + '/' + group.id;
                group.items.forEach(function(item) {
                    if (item.name) {
                        item.link = group.link + '/' + item.name.replace(/\W+/g, '');
                        item.title = item.title || item.name;
                    }
                });
            });

            return listing;
        });

        return result;
    };

    Doxit.prototype.getMetaInfos = function() {
        var files = ['doxit.json', 'package.json'],
            dir,
            meta = {},
            file;

        for (var i = 0, len = files.length; i < len; i++) {
            dir = process.cwd();
            while(dir !== '/') {
                file = path.join(dir, files[i]);
                if (fs.existsSync(file)) {
                    if (files[i] === 'doxit.json') {
                        meta = require(file);
                    }
                    else {
                        var pkg = require(file);
                        meta.name = meta.name || pkg.name;
                        meta.version = meta.version || pkg.version;
                        meta.description = meta.description || pkg.description;
                    }
                }

                dir = path.join(dir, '..');
            }
        }

        return meta;
    };

    Doxit.prototype.setGroup = function(groupName, onCreateGroup) {
        var group;

        for (var i = 0, len = this.listing.length; i < len; i++) {
            if (this.listing[i].name === groupName) {
                return this.listing[i];
            }
        }

        group = new DoxitGroup(groupName);
        this.listing.push(group);
        if (typeof(onCreateGroup) === 'function') {
            onCreateGroup.call(group);
        }

        return group;
    };

    Doxit.prototype.parseTags = function(doxed) {
        var newTag = {};

        var tags = doxed.tags;

        console.log('Doxed: ', doxed);

        if (tags && Array.isArray(tags)) {
            tags.forEach(function(tag) {

                switch(tag.type) {
                    case 'module':
                    case 'mixin':
                        newTag.type = tag.type;
                        newTag.name = tag.string;
                        break;
                    case 'method':
                    case 'function':
                        newTag.type = tag.type;
                        newTag.name = tag.string || doxed.ctx.name;
                        break;
                    case 'var':
                        var match = tag.string.trim().match(/^(?:\{(.*)\})?\s*(\S+)?\s*(.+)?$/);
                        console.log(match);

                        if (match[1]) {
                            newTag.dataTypes = match[1].split('|').map(function(type) {
                                return type.toLowerCase();
                            });
                        }

                        if (match[2]) {
                            newTag.name = match[2];
                        }

                        if (match[3]) {
                            newTag.description = match[3];
                        }

                        newTag.type = tag.type;
                        break;
                    case 'group':
                        newTag.group = tag.string;
                        break;
                    case 'constructor':
                        newTag.isConstructor = true;
                        newTag.type = 'function';
                        newTag.name = doxed.ctx.name;
                        break;
                    case 'property':
                        newTag.name = tag.name;
                        newTag.type = tag.type;
                        newTag.dataTypes = tag.types.map(function(type) {
                            return type.substr(0, 1).toUpperCase() + type.substr(1).toLowerCase();
                        });
                        break;
                    case 'example':
                        if (!newTag.examples) {
                            newTag.examples = [];
                        }
                        newTag.examples.push({
                            code: tag.string
                        });
                        break;
                    case 'deprecated':
                        newTag.deprecated = tag.string || true;
                        break;
                    case 'private':
                    case 'protected':
                    case 'unimplemented':
                        newTag[tag.type.substr(0, 1).toUpperCase() + tag.type.substr(1)] = true;
                        break;
                }
            });

            if (doxed.ctx && (doxed.ctx.type === 'function' || doxed.ctx.type === 'method') && !newTag.type) {
                newTag.type = doxed.ctx.type;
                newTag.name = doxed.ctx.name;
            }
        }

        return newTag;
    };

    Doxit.prototype.grepPattern = function(pattern, str, index) {
        index = index || 1;
        
        var match = str.match(pattern);
        if (match && match[index]) {
            return match[index];
        }

        return null;
    };

    /**
     * Greps data types from a type string.
     *
     * Removes trailing and leading curly braces and returns data types as an array
     * 
     * @param  {string} str Data type string
     * @return {array}     Returns data types array or an emptyy array
     */
    Doxit.prototype.grepDataTypes = function(str) {
        if (typeof str !== 'string' || str === '') {
            return [];
        }

        return str.replace(/^\{|\}$/g, '').split('|');
    };

    Doxit.prototype.grepDescription = function(description) {
        return description.full;
    };

    return Doxit;
})();