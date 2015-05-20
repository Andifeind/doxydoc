'use strict';

var fs = require('fs'),
    path = require('path');

var Superjoin = require('superjoin'),
    Markdown = require('markdown-it'),
    extend = require('node.extend'),
    grunt = require('grunt');

var DoxyDocParser = require('./doxydocParser'),
    firetpl = require('firetpl');

var PageCreator = function(conf) {
    this.conf = {
        indexPage: 'README.md',
        templateDir: conf.templateDir || path.join(__dirname, '../templates/lagoon/'),
        output: conf.output || 'docs',
        docuFilename: conf.docuFilename || 'docu.html'
    };

    var templateDirs = require('../doxydoc').templateDirs;
    if (templateDirs[this.conf.templateDir]) {
        this.conf.templateDir = templateDirs[this.conf.templateDir];
    }

    this.doxydocFile = conf.doxydocFile || 'doxydoc.json';
    this.rootDir = process.cwd();
    this.outDir = path.resolve(process.cwd(), this.conf.output);
    this.locals = extend(conf.locals, this.getMetaInfos());
};

PageCreator.prototype.log = function() {
    if (!this.silent) {
        var args = Array.prototype.slice.call(arguments);
        grunt.log.ok.apply(grunt.log, args);
    }
};

PageCreator.prototype.createPages = function() {
    this.prepareData();

    if (fs.existsSync(path.join(this.rootDir, this.doxydocFile))) {
        extend(this.conf, require(path.join(this.rootDir, this.doxydocFile)));
    }

    if (this.locals.customJS && typeof this.locals.customJS === 'string') {
        this.locals.customJS = [this.locals.customJS];
    }

    if (this.locals.customCSS && typeof this.locals.customCSS === 'string') {
        this.locals.customCSS = [this.locals.customCSS];
    }

    if (this.conf.customJS) {
        if (!this.locals.customJS) {
            this.locals.customJS = [];
        }

        this.locals.customJS.push();
    }

    //Create index page
    if (this.conf.indexPage) {
        this.createPage(this.conf.indexPage, 'index.html', 'index.fire');
    }

    //Parse navigation links
    ['headerLinks', 'navigationLinks'].forEach(function(key) {
        if (!(key in this.conf)) {
            return;
        }
        
        this.conf[key].forEach(function(link) {
            if (link.file) {
                this.createPage(link.file, link.link, 'page.fire', link);
            }
        }, this);
    }, this);


    //Create documentation
    var docu = this.createDocu('html', this.files),
        docuPath = path.join(this.outDir, this.conf.docuFilename);
    
    var outDir = this.outDir;

    //Create js bundle
    var superjoin = new Superjoin();

    superjoin.verbose = this.verbose;
    superjoin.root = this.conf.templateDir;
    var sjConf = superjoin.getConf();
    var out = superjoin.join(sjConf.files, sjConf.main);
    grunt.file.write(path.join(outDir, 'doxydoc.js'), out);

    var self = this;

    var copyAssets = function(abspath, rootdir, subdir, file) {
        var src, dest;

        if (arguments.length === 2) {
            src = abspath;
            dest = rootdir;
        }
        else {
            if (!subdir || !/^js|lib\//.test(subdir)) {
                return;
            }

            src = abspath;
            dest = path.join(outDir, subdir, file);
        }

        self.log(' ... copy', src.replace(path.join(__dirname, '..') + '/', ''));
        grunt.file.copy(src, dest);
    };

    this.log('Create docu page:', this.conf.docuFilename);
    this.log('Copy docu to:', this.outDir);
    grunt.file.write(docuPath, docu);
    copyAssets(path.join(this.conf.templateDir, 'main.css'), path.join(outDir, 'main.css'));
    copyAssets(path.join(__dirname, '../node_modules/highlight.js/styles/', 'dark.css'), path.join(outDir, 'highlight.css'));
    this.log('Finish!');
};

PageCreator.prototype.createPage = function(src, name, template, data) {
    data = data || {};
    
    var ext = path.extname(src);
    this.log('Create page "%s" from source: %s', name, src);
    
    template = template || 'page.fire';

    var source = '';
    if (fs.existsSync(src)) {
        if (ext === '.md') {
            source = this.parseMarkdown(fs.readFileSync(src, { encoding: 'utf8' }));
        }
        else if (ext === '.fire') {
            source = this.parseFireTPL(fs.readFileSync(src, { encoding: 'utf8' }));
        }
        else {
            source = fs.readFileSync(src, { encoding: 'utf8' });
        }
    }

    var locals = extend(true, {}, this.locals);
    var basePath = this.resolveToBase(name) || '';
    if (basePath) {
        ['headerLinks', 'navigationLinks'].forEach(function(key) {
            if (locals[key]) {
                locals[key].forEach(function(link) {
                    link.link = path.join(basePath, link.link);
                });
            }
        });
    }

    ['customJS', 'customCSS'].forEach(function(method) {
        if (locals[method] && data[method]) {
            locals[method] = locals[method].concat(data[method]).reduce(function(a, b){
                if (a.indexOf(b) < 0 ) {
                    a.push(b);
                }

                return a;
            }, []);

        }
    });

    if (data.navigation) {
        data.navigation = this.scanHeadlines(source);
    }

    var extended = extend({
        content: source,
        title: data.name || locals.name,
        basePath: basePath
    }, data, locals);
    
    var ftl = grunt.file.read(path.join(this.conf.templateDir, template));
    var html = firetpl.fire2html(ftl, extended, {
        partialsPath: path.join(this.conf.templateDir, 'partials')
    });

    grunt.file.write(path.join(this.outDir, name), html);
};

PageCreator.prototype.parseMarkdown = function(source) {
    var md = new Markdown({
        html:         true,        // Enable HTML tags in source 
        breaks:       true,        // Convert '\n' in paragraphs into <br> 
        langPrefix:   'codeBlock ',  // CSS language prefix for fenced blocks. Can be 
                                  // useful for external highlighters. 
        linkify:      true        // Autoconvert URL-like text to links 
    });
    return md.render(source);
};

PageCreator.prototype.parseFireTPL = function(source) {
    return firetpl.fire2html(source, this.locals, {
        partialsPath: path.join(this.conf.templateDir, 'partials')
    });
};

PageCreator.prototype.createDocu = function(type, files) {
    
    var doxydoc = new DoxyDocParser();
    doxydoc.templateFile = path.join(this.conf.templateDir, 'docu.fire');
    doxydoc.templateDir = this.conf.templateDir;
    doxydoc.doxydocFile = this.doxydocFile;
    return doxydoc.parse(type, files, {
        basePath: this.resolveToBase(this.conf.docuFilename) || ''
    });
};

PageCreator.prototype.getMetaInfos = function() {
    var files = [this.doxydocFile, 'package.json'],
        dir,
        meta = {},
        file;

    for (var i = 0, len = files.length; i < len; i++) {
        dir = this.rootDir;
        while(dir !== '/') {
            file = path.join(dir, files[i]);
            if (fs.existsSync(file)) {
                if (files[i] === this.doxydocFile) {
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

PageCreator.prototype.prepareData = function() {
    ['navigationLinks', 'headerLinks'].forEach(function(key) {
        if (!(key in this.locals)) {
            return;
        }

        this.locals[key].forEach(function(link) {
            if (!link.target) {
                link.target = '_self';
            }

            if (link.customJS && typeof link.customJS === 'string') {
                link.customJS = [link.customJS];
            }

            if (link.customCSS && typeof link.customCSS === 'string') {
                link.customCSS = [link.customCSS];
            }

            var basePath = this.resolveToBase(link.link) || '';

            ['customCSS', 'customJS'].forEach(function(fileType) {
                if (basePath && link[fileType]) {
                    link[fileType] = link[fileType].map(function(filePath) {
                        if (!/^(https?:)?\/\//.test(filePath)) {
                            filePath = path.join(basePath, filePath);
                        }

                        return filePath;
                    });
                }
            });

        }, this);
    }, this);
};

/**
 * Resolve a path relative to the baseDir
 *
 * @param {String} path Path to be resolved
 * @return {String} Resolved path
 */
PageCreator.prototype.resolveToBase = function(path) {
    var resolved = path.split('/').map(function(part, index, arr) {
        if (index + 1 === arr.length) {
            return '';
        }

        return '..';
    }).join('/');

    return resolved;
};

/**
 * Scans a html string and return an array of all nested anchor links
 * @param  {String} html Input string
 * @return {Array}      Array of found anchor links
 */
PageCreator.prototype.scanHeadlines = function(html) {
    var reg = /<(a|h[1-6])[^>]+\bid\=["'](.*?)["'].*?>(.+?)<\/(a|h[1-6])>/g,
        links = [];

    while(true) {
        var match = reg.exec(html);
        if (!match) {
            break;
        }

        links.push({
            link: match[2],
            text: this.stripHtml(match[3])
        });
    }

    return links;
};

/**
 * Strip any html tags from a string
 * @param  {String} str Input string
 * @return {String}     Stripped string
 */
PageCreator.prototype.stripHtml = function(str) {
    return str.replace(/<\/?[a-zA-Z0-9]+.*?>/g, '');
};

module.exports = PageCreator;
