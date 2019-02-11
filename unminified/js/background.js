var prefs_, sieveResLocal;
RegExp.escape = function(s) {
    return s.replace(/[/\\^$-.+*?|(){}[\]]/g, "\\$&")
};
var withBaseURI = function(base, link, addProtocol) {
    if (link[1] === "/" && link[0] === "/") {
        if (addProtocol) return base.slice(0, base.indexOf(":") + 1) + link;
        return link
    }
    if (/^[\w-]{2,20}:/i.test(link)) return link;
    return base.replace(link[0] === "/" ? /(\/\/[^/]+)\/.*/ : /(\/)[^/]*(?:[?#].*)?$/, "$1") + link
};
var updateSieve = function(localUpdate, callback) {
    var newSieve;
    var xhr = new XMLHttpRequest;
    var onStoredSieveReady = function(items) {
        var localSieve = items.sieve;
        if (localSieve) {
            var rule;
            var tempSieve = {};
            for (rule in localSieve) {
                if (rule === "dereferers") break;
                if (!newSieve[rule]) tempSieve[rule] = localSieve[rule]
            }
            for (rule in newSieve) tempSieve[rule] = newSieve[rule];
            newSieve = tempSieve
        }
        updatePrefs({
            sieve: newSieve
        }, function() {
            if (typeof callback === "function") callback(newSieve)
        });
        console.info(app.name + ": Sieve updated from " + (localUpdate ? "local" : "remote") + " repository.")
    };
    xhr.onload = function() {
        this.onload = null;
        try {
            if (!localUpdate && !this.responseText) throw new Error("HTTP " + this.status);
            newSieve = JSON.parse(this.responseText);
            cfg.get("sieve", onStoredSieveReady)
        } catch (ex) {
            console.warn(app.name + ": Sieve failed to update from " + (localUpdate ? "local" : "remote") + " repository! | ", ex.message);
            if (!localUpdate) cfg.get("sieve", function(items) {
                if (!items.sieve) updateSieve(true)
            })
        }
    };
    xhr.overrideMimeType("application/json;charset=utf-8");
    xhr.open("GET", localUpdate ? withBaseURI(document.baseURI, "unminified/sieve.jsn") : prefs_.sieveRepository, true);
    xhr.send(null)
};
var cacheSieve = function(newSieve) {
    if (typeof newSieve === "string") newSieve = JSON.parse(newSieve);
    else newSieve = JSON.parse(JSON.stringify(newSieve));
    var cachedSieve = [];
    sieveResLocal = [];
    for (var ruleName in newSieve) {
        var rule = newSieve[ruleName];
        if (!rule.link && !rule.img || rule.img && !rule.to && !rule.res) continue;
        try {
            if (rule.off) throw new Error(ruleName + " is turned off");
            if (rule.res)
                if (/^:\n/.test(rule.res)) {
                    sieveResLocal[cachedSieve.length] = rule.res.slice(2);
                    rule.res = 1
                } else {
                    if (rule.res.indexOf("\n") > -1) {
                        var lines = rule.res.split(/\n+/);
                        rule.res = RegExp(lines[0]);
                        if (lines[1]) rule.res = [rule.res, RegExp(lines[1])]
                    } else rule.res = RegExp(rule.res);
                    sieveResLocal[cachedSieve.length] = rule.res;
                    rule.res = true
                }
        } catch (ex) {
            if (typeof ex === "object") console.error(ruleName, rule, ex);
            continue
        }
        if (rule.to && rule.to.indexOf("\n") > 0 && rule.to.indexOf(":\n") !== 0) rule.to = rule.to.split("\n");
        delete rule.note;
        cachedSieve.push(rule)
    }
    prefs_.sieve = cachedSieve
};
var updatePrefs = function(sentPrefs, callback) {
    if (!sentPrefs) sentPrefs = {};
    var defPrefs;
    var onStoredPrefsReady = function(items) {
        var needToUpdate, key, pref;
        var newPrefs = {};
        var itemsToStore = {};
        for (key in defPrefs) {
            needToUpdate = false;
            if (typeof defPrefs[key] === "object") {
                newPrefs[key] = sentPrefs[key] || items[key] || defPrefs[key];
                needToUpdate = true;
                if (!Array.isArray(defPrefs[key]))
                    for (pref in defPrefs[key])
                        if (newPrefs[key][pref] === void 0 || typeof newPrefs[key][pref] !== typeof defPrefs[key][pref]) newPrefs[key][pref] = (!prefs_ || prefs_[key][pref] === void 0 ? defPrefs : prefs_)[key][pref]
            } else {
                pref = sentPrefs[key] || items[key] || defPrefs[key];
                if (typeof pref !== typeof defPrefs[key]) pref = defPrefs[key];
                if (!prefs_ || prefs_[key] !== pref) needToUpdate = true;
                newPrefs[key] = pref
            }
            if (needToUpdate || items[key] === void 0) itemsToStore[key] = newPrefs[key]
        }
        prefs_ = newPrefs;
        if (newPrefs.grants) {
            pref = newPrefs.grants || [];
            var grants = [];
            for (key = 0; key < pref.length; ++key) {
                if (pref[key].op === ";") continue;
                grants.push({
                    op: pref[key].op,
                    url: pref[key].op.length === 2 ? RegExp(pref[key].url, "i") : pref[key].url
                })
            }
            if (grants.length) prefs_.grants = grants
        }
        if (sentPrefs.sieve) {
            itemsToStore.sieve = typeof sentPrefs.sieve === "string" ? JSON.parse(sentPrefs.sieve) : sentPrefs.sieve;
            cacheSieve(itemsToStore.sieve)
        }
        cfg.set(itemsToStore, function() {
            if (!sentPrefs.sieve) cfg.get("sieve", function(prefs) {
                if (prefs.sieve) cacheSieve(prefs.sieve);
                else updateSieve(true)
            });
            if (typeof callback === "function") callback()
        })
    };
    defPrefs = new XMLHttpRequest;
    defPrefs.overrideMimeType("application/json;charset=utf-8");
    defPrefs.open("GET", withBaseURI(document.baseURI, "unminified/defaults.jsn"), true);
    defPrefs.onload = function() {
        this.onload = null;
        defPrefs = JSON.parse(defPrefs.responseText);
        cfg.get(Object.keys(defPrefs), onStoredPrefsReady)
    };
    defPrefs.send(null)
};
var onMessage = function(ev, origin, postMessage) {
    var msg, e;
    if (origin === null) msg = ev;
    else {
        e = Port.parse_msg(ev, origin, postMessage);
        msg = e.msg
    }
    if (!msg.cmd) return;
    switch (msg.cmd) {
        case "hello":
            var i, l, grants, blockaccess = false,
                sitePrefs = {
                    hz: prefs_.hz,
                    sieve: prefs_.sieve,
                    tls: prefs_.tls,
                    keys: prefs_.keys
                };
            if (prefs_.grants) {
                grants = prefs_.grants;
                for (i = 0, l = grants.length; i < l; ++i)
                    if (grants[i].url === "*" || grants[i].op[1] && grants[i].url.test(e.origin) || e.origin.indexOf(grants[i].url) > -1) blockaccess = grants[i].op[0] === "!" ? true : false
            }
            e.postMessage({
                cmd: "hello",
                prefs: blockaccess ? null : sitePrefs
            });
            break;
        case "cfg_get":
            if (!Array.isArray(msg.keys)) msg.keys = [msg.keys];
            cfg.get(msg.keys, function(items) {
                e.postMessage({
                    cfg: items
                })
            });
            break;
        case "cfg_del":
            if (!Array.isArray(msg.keys)) msg.keys = [msg.keys];
            cfg.remove(msg.keys);
            break;
        case "getLocaleList":
            var lxhr = new XMLHttpRequest;
            lxhr.overrideMimeType("application/json;charset=utf-8");
            lxhr.open("GET", withBaseURI(document.baseURI, "unminified/locales.jsn"), true);
            lxhr.onload = function() {
                this.onload = null;
                e.postMessage(this.responseText)
            };
            lxhr.send(null);
            break;
        case "savePrefs":
            updatePrefs(msg.prefs);
            break;
        case "update_sieve":
            updateSieve(false, function(newSieve) {
                e.postMessage({
                    updated_sieve: newSieve
                })
            });
            break;
        case "download":
            if (typeof window.saveURI === "function") window.saveURI({
                url: msg.url,
                priorityExt: msg.priorityExt,
                ext: msg.ext,
                isPrivate: e.isPrivate
            });
            break;
        case "history":
            if (typeof to_fromHistory === "function" && !e.isPrivate) to_fromHistory(msg.url, msg.manual);
            break;
        case "open":
            if (!Array.isArray(msg.url)) msg.url = [msg.url];
            msg.url.forEach(function(url) {
                if (!url || typeof url !== "string") return;
                var params = {
                    url: url,
                    active: !msg.nf
                };
                if (origin && origin.tab && origin.tab.id) params.openerTabId = origin.tab.id;
                try {
                    Tabs.create(params)
                } catch (ex) {
                    delete params.openerTabId;
                    Tabs.create(params)
                }
            });
            break;
        case "resolve":
            var data = {
                cmd: "resolved",
                id: msg.id,
                m: null,
                params: msg.params
            };
            var rule = prefs_.sieve[data.params.rule.id];
            if (!/^https?:/.test(msg.url)) {
                console.warn(app.name + ": URL pattern doesn't match: " + msg.url);
                return
            }
            if (data.params.rule.req_res) data.params.rule.req_res = sieveResLocal[data.params.rule.id];
            if (data.params.rule.skip_resolve) {
                data.params.url = [""];
                e.postMessage(data);
                return
            }
            var post_params = /([^\s]+)(?: +:(.+)?)?/.exec(msg.url);
            msg.url = post_params[1];
            if (!post_params[2]) post_params[2] = null;
            if (rule.res === 1) {
                data.m = true;
                data.params._ = "";
                data.params.url = [post_params[1], post_params[2]]
            }
            post_params = post_params[2];
            var xhr = new XMLHttpRequest;
            xhr.onloadend = function() {
                this.onloadend = null;
                var base_url, match;
                if (/^(image|video|audio)\//i.test(this.getResponseHeader("Content-Type"))) {
                    data.m = msg.url;
                    data.noloop = true;
                    console.warn(app.name + ": rule " + data.params.rule.id + " matched against an image file");
                    e.postMessage(data);
                    return
                }
                base_url = this.responseXML && this.responseXML.baseURI;
                if (!base_url) {
                    base_url = this.responseText.slice(0, 4096);
                    if (base_url = /<base\s+href\s*=\s*("[^"]+"|'[^']+')/.exec(base_url)) base_url = withBaseURI(msg.url, base_url[1].slice(1, -1).replace(/&amp;/g, "&"), true);
                    else base_url = msg.url
                }
                if (rule.res === 1) {
                    data.params._ = this.responseText;
                    data.params.base = base_url.replace(/(\/)[^\/]*(?:[?#].*)*$/, "$1");
                    e.postMessage(data);
                    return
                }
                var _match = sieveResLocal[data.params.rule.id];
                _match = (Array.isArray(_match) ? _match : [_match]).map(function(el) {
                    var sel = el.source || el;
                    if (sel.indexOf("$") === -1) return el;
                    var group = data.params.length;
                    group = Array.apply(null, Array(group)).map(function(_, i) {
                        return i
                    }).join("|");
                    group = RegExp("([^\\\\]?)\\$(" + group + ")", "g");
                    group = !group.test(sel) ? el : sel.replace(group, function(m, prefix, id) {
                        return id < data.params.length && prefix !== "\\" ? prefix + (data.params[id] ? RegExp.escape(data.params[id]) : "") : m
                    });
                    return typeof el === "string" ? group : RegExp(group)
                });
                match = _match[0].exec(this.responseText);
                if (match) {
                    var match_param = data.params.rule.loop_param;
                    if (rule.dc && (match_param === "link" && rule.dc !== 2 || match_param === "img" && rule.dc > 1)) match[1] = decodeURIComponent(decodeURIComponent(match[1]));
                    data.m = withBaseURI(base_url, match[1].replace(/&amp;/g, "&"));
                    if (match[2] && (match = match.slice(1)) || _match[1] && (match = _match[1].exec(this.responseText))) data.m = [data.m, match.filter(function(el, idx) {
                        return idx && el ? true : false
                    }).join(" - ")]
                } else console.info(app.name + ": no match for " + data.params.rule.id);
                e.postMessage(data)
            };
            xhr.open(post_params ? "POST" : "GET", msg.url);
            if (e.isPrivate && typeof Components === "object") try {
                xhr.channel.QueryInterface(Ci.nsIPrivateBrowsingChannel).setPrivate(true)
            } catch (ex) {}
            if (post_params) xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
            xhr.send(post_params);
            break
    }
    return true
};
Port.listen(onMessage);
document.title = ":: " + app.name + " ::";
cfg.migrateOldStorage(["version", "hz", "tls", "keys", "grants", "sieve"], function() {
    cfg.get("version", function(items) {
        var day = 24 * 3600 * 1E3;
        var version = items.version || {};
        var lastCheck = version.lastCheck || 0;
        if (version.current !== app.version) {
            var oldVersion = version.current;
            version = {
                current: app.version,
                lastCheck: Date.now() + (Math.random() * 15 | 0) * day
            };
            console.info(app.name + " has been " + (oldVersion ? "updated!" : "installed!"));
            cfg.set({
                version: version
            }, function() {
                if (oldVersion) updateSieve(true);
                else updatePrefs()
            });
            return
        }
        updatePrefs(null, function() {
            if (!prefs_.tls.sieveAutoUpdate) return;
            if (lastCheck && Date.now() - lastCheck < 15 * day) return;
            var xhr = new XMLHttpRequest;
            xhr.onload = function() {
                try {
                    var check = JSON.parse(this.responseText);
                    if (lastCheck < check.sieve_ver) updateSieve()
                } catch (ex) {
                    console.warn(app.name + ": update check failed!", ex)
                }
                version.lastCheck = Date.now();
                cfg.set({
                    version: version
                })
            };
            xhr.open("GET", "https://tiny.cc/Imagus-sieve-info", true);
            xhr.send(null)
        })
    })
});