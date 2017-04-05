'use strict';

// constants

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _markStateToClass;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var NO_TYPE = 'No_Type';

/*
Event defintion
 */
function Event(sender) {
    this._sender = sender;
    this._listeners = [];
}

Event.prototype = {
    attach: function attach(listener) {
        this._listeners.push(listener);
    },
    notify: function notify(args) {
        var index;

        for (index = 0; index < this._listeners.length; index += 1) {
            this._listeners[index](this._sender, args);
        }
    },
    forwardEvent: function forwardEvent(nextEvent) {
        // forwards this events notifications to the nextEvent
        this.attach(function (sender, args) {
            return nextEvent.notify(args);
        });
    }
};

/*
End of Event definition
 */

// ----------------------------------------------------------------------

/*
Reason Annotation Model
*/

var RAModel = function () {
    function RAModel(docJson, annJson, coarseToFine, typeAlias) {
        _classCallCheck(this, RAModel);

        this._docJson = docJson;
        this._annJson = annJson;
        this._coarseToFine = coarseToFine;
        this._typeAlias = typeAlias;
        this._annotationDS = getReasonAnnotationDS(docJson, annJson);
    }

    _createClass(RAModel, [{
        key: 'getKeyorNull',
        value: function getKeyorNull(sIdx, eIdx) {
            var sentence = this._docJson.sentences[sIdx];
            if (_.isNil(sentence)) return null;
            var ent = sentence.ents[eIdx];
            if (_.isNil(ent)) return null;
            return sIdx + '-' + ent.start + '-' + ent.end;
        }
    }, {
        key: 'annotationDStoPostDict',
        value: function annotationDStoPostDict() {
            var docJson = this._docJson;
            var annotationDS = this._annotationDS;
            var postDS = {};
            _.each(annotationDS, function (annotationInfo, eKey) {
                postDS[docJson['doc_id'] + '-' + eKey] = annotationInfo;
            });
            return postDS;
        }
    }]);

    return RAModel;
}();

/*
End of Type Annotation Model
 */

// ----------------------------------------------------------------------

/*
Reason Annotation View 
*/

var MarkStates = _.keyBy(['SELECTED', 'UNSELECTED_NOTDONE', 'UNSELECTED_DONE', 'UNSELECTED_ERROR'], _.identity);

var markStateToClass = (_markStateToClass = {}, _defineProperty(_markStateToClass, MarkStates.SELECTED, 'selected'), _defineProperty(_markStateToClass, MarkStates.UNSELECTED_NOTDONE, ''), _defineProperty(_markStateToClass, MarkStates.UNSELECTED_DONE, 'done'), _defineProperty(_markStateToClass, MarkStates.UNSELECTED_ERROR, 'error'), _markStateToClass);

var RAView = function () {
    function RAView(raModel) {
        _classCallCheck(this, RAView);

        this._raModel = raModel;

        this._$docRoot = $('div#doc-view');
        this._renderDocInNode(raModel._docJson, this._$docRoot);

        this._marksDict = this._createMarksDict(this._$docRoot);
        this.markClicked = new Event(this);
        this.isTrueClicked = new Event(this);
        this.reasonCheckBoxClicked = new Event(this);
        this._registerClicksOnMark(this._marksDict);

        this.currentFocus = null;
    }

    _createClass(RAView, [{
        key: '_attachAnnotationView',
        value: function _attachAnnotationView($node, annotationInfo) {
            var _this2 = this;

            var _this = this;
            var typeArr = _.sortBy(_.keys(annotationInfo));

            var annotView = $('<div id="annotation-view"></div>');
            if (_.size(typeArr) == 0) {
                var infoTmpl = document.getElementById('info-template');
                var $alertNode = $(infoTmpl.content.cloneNode(true)).find('div.alert');
                $alertNode.append('Nothing to annotate for this entity! Please skip it.');
                annotView.append($alertNode);
                $node.append(annotView);
                return;
            }

            _.each(typeArr, function (type) {
                var annRowTmpl = document.getElementById('annotation-row-template');
                var annRow = $(annRowTmpl.content.cloneNode(true)).find('div.annotation-row');
                annRow.find('.type-name-col').html(_this2._raModel._typeAlias.get(type));
                annotView.append(annRow);

                _.each(ReasonsEnum, function (val, key) {
                    annRow.find('div.reasons-col input:checkbox[value="' + val + '"]')[0].checked = annotationInfo[type][key];
                });
            });
            $node.append(annotView);
            // annotView.find('div.is-true-col input').bootstrapToggle();

            // attach event triggers
            $.each(annotView.find('div.annotation-row'), function (index) {
                var annRow = $(this);
                var type = typeArr[index];
                var isTrueState = annotationInfo[type].isTrue ? 'on' : 'off';

                annRow.find('.is-true-col input').bootstrapToggle(isTrueState);
                annRow.find('.is-true-col input').change(function () {
                    _this.isTrueClicked.notify({ 'type': type, 'checked': $(this).prop('checked') });
                    if (!$(this).prop('checked')) {
                        annRow.find('div.reasons-col').hide();
                    } else {
                        annRow.find('div.reasons-col').show();
                    }
                });

                annRow.find('div.reasons-col input').change(function () {
                    _this.reasonCheckBoxClicked.notify({ 'type': type, 'reason': this.value, 'checked': this.checked });
                });

                // if isTrue is false
                if (!annotationInfo[type].isTrue) {
                    annRow.find('div.reasons-col').hide();
                }
            });
        }
    }, {
        key: '_removeAnnotationView',
        value: function _removeAnnotationView($node) {
            $('div#annotation-view').remove();
        }
    }, {
        key: '_createMarksDict',
        value: function _createMarksDict($node) {
            var marksDict = {};
            $node.find('mark[data-entity]').each(function (index, markNode) {
                var $markNode = $(markNode);
                // let sIdx = parseInt($markNode.attr('sent-id'));
                var eKey = $markNode.attr('ent-key');

                marksDict[eKey] = { $node: $markNode, state: MarkStates.UNSELECTED_NOTDONE, prevState: MarkStates.UNSELECTED_NOTDONE };
            });
            return marksDict;
        }
    }, {
        key: '_registerClicksOnMark',
        value: function _registerClicksOnMark(marksDict) {
            var _this3 = this;

            _.each(marksDict, function (mark, eKey) {
                mark.$node.on('click', function () {
                    _this3.markClicked.notify({ mark: mark, eKey: eKey });
                });
            });
        }
    }, {
        key: '_setMarkState',
        value: function _setMarkState(mark, state) {
            if (!_.includes(_.values(MarkStates), state)) return;
            mark.$node.attr('class', markStateToClass[state]);
            mark.prevState = mark.state;
            mark.state = state;
        }
    }, {
        key: 'focusOnMark',
        value: function focusOnMark(eKey, annotationInfo) {
            var mark = this._marksDict[eKey];

            this._setMarkState(mark, MarkStates.SELECTED);
            this.currentFocus = eKey;

            // add the annotation view to the mark parent sentence view
            this._attachAnnotationView(mark.$node.closest('div.list-group-item'), annotationInfo);
        }
    }, {
        key: 'unFocus',
        value: function unFocus(isDone) {
            if (_.isNil(this.currentFocus)) return;
            this._setMarkState(this._marksDict[this.currentFocus], isDone ? MarkStates.UNSELECTED_DONE : MarkStates.UNSELECTED_NOTDONE);
            this._removeAnnotationView(this._marksDict[this.currentFocus].$node);
            this.currentFocus = null;
        }
    }, {
        key: '_highlightErrorMarks',
        value: function _highlightErrorMarks(marks) {
            var _this4 = this;

            _.each(marks, function (mark) {
                _this4._setMarkState(mark, MarkStates.UNSELECTED_ERROR);
            });
        }

        //--------  doc load utilities ------------

    }, {
        key: '_getSentenceHTMLElement',
        value: function _getSentenceHTMLElement(sentence, sIdx) {
            // return string constructed with tokens and spaces in [start, end)
            var getTextFromSpanForTokenSpaces = function getTextFromSpanForTokenSpaces(tsps, st, end) {
                return _(tsps).slice(st, end).reduce(function (acc, tsp) {
                    return acc + tsp[0] + tsp[1];
                }, '');
            };

            var wrapTextInMark = function wrapTextInMark(text, ent) {
                return '<mark data-entity ent-key="' + sIdx + '-' + ent.start + '-' + ent.end + '" sent-id="' + sIdx + '">' + text + '</mark>';
            };

            // tuples of tokens, spaces ( => zip(tokens, spaces) )
            var tokenSpaces = _.isUndefined(sentence.spaces) ? _.map(sentence.tokens, function (t) {
                return [t, " "];
            }) : _.zip(sentence.tokens, sentence.spaces);

            var getTextFromSpan = _.partial(getTextFromSpanForTokenSpaces, tokenSpaces);

            var sentLen = tokenSpaces.length;
            var ents = sentence.ents;

            var sentNode = document.createElement('div');
            // now populate sentNode with sentence contents by iterating through ents
            if (ents.length == 0) sentNode.innerText = getTextFromSpan(0, sentLen);else {
                var sentInnerHTML = "";
                var lastEntEnd = 0;
                _.each(ents, function (ent, eIdx) {
                    // add text before the entity
                    sentInnerHTML += getTextFromSpan(lastEntEnd, ent.start);
                    sentInnerHTML += wrapTextInMark(getTextFromSpan(ent.start, ent.end), ent);
                    lastEntEnd = ent.end;
                });
                // add text after the last entity
                sentInnerHTML += getTextFromSpan(lastEntEnd, sentLen);
                sentNode.innerHTML = sentInnerHTML;
            }
            return sentNode;
        }
    }, {
        key: '_getDocHTMLNode',
        value: function _getDocHTMLNode(docJson) {
            // listItem template
            var sentTmpl = document.getElementById('sentence-template');
            var $group = $('<div>', { 'class': 'list-group' });

            var _this = this;
            _.each(docJson['sentences'], function (sentence, sIdx) {
                var $sc = $(sentTmpl.content.cloneNode(true));
                $sc.find('div.sentence-content').append(_this._getSentenceHTMLElement(sentence, sIdx));
                $sc.find('span.sentence-list-index').text(parseInt(sIdx) + 1);

                var $li = $('<div>', { 'class': 'list-group-item' }).append($sc).attr('id', 'sentence-' + sIdx);
                $group.append($li);
            });
            return $group[0];
        }
    }, {
        key: '_renderDocInNode',
        value: function _renderDocInNode(docJson, $node) {
            var docHtml = this._getDocHTMLNode(docJson);
            $node.append(docHtml);
        }
    }]);

    return RAView;
}();

/*
End of Reason Annotation View 
*/

// ----------------------------------------------------------------------

/*
Reason Controller View 
*/

var RAController = function () {
    function RAController(raModel, raView) {
        _classCallCheck(this, RAController);

        this._raModel = raModel;
        this._raView = raView;

        this._attachListenersToView(raView);
    }

    _createClass(RAController, [{
        key: '_attachListenersToView',
        value: function _attachListenersToView(caView) {
            raView.markClicked.attach(this._onMarkClick.bind(this));
            raView.isTrueClicked.attach(this._onIsTrueClick.bind(this));
            raView.reasonCheckBoxClicked.attach(this._onReasonCheckBoxClicked.bind(this));
        }
    }, {
        key: '_onMarkClick',
        value: function _onMarkClick(sender, args) {
            console.log('received click from ' + args.eKey);

            var mark = args.mark;
            // console.log(mark);

            // currently no focused
            if (_.isNil(this._raView.currentFocus)) {
                this._raView.focusOnMark(args.eKey, this._raModel._annotationDS[args.eKey]);
            } else {
                var currentFocus = this._raView.currentFocus;
                // unfocus the current thing
                this._raView.unFocus(this._isDone(currentFocus));

                // clicked on the a new mark, then select it
                if (args.eKey != currentFocus) {
                    this._raView.focusOnMark(args.eKey, this._raModel._annotationDS[args.eKey]);
                }
                return;
            }
        }
    }, {
        key: '_onIsTrueClick',
        value: function _onIsTrueClick(sender, args) {
            if (_.isNil(this._raView.currentFocus)) return;

            var focusedMark = this._raView._marksDict[this._raView.currentFocus];
            var annotationInfo = this._raModel._annotationDS[this._raView.currentFocus];

            annotationInfo[args.type].isTrue = args.checked;
            if (!args.checked) {
                _.each(ReasonsEnum, function (val, key) {
                    annotationInfo[args.type][key] = false;
                });
            }
        }
    }, {
        key: '_onReasonCheckBoxClicked',
        value: function _onReasonCheckBoxClicked(sender, args) {
            if (_.isNil(this._raView.currentFocus)) return;

            var focusedMark = this._raView._marksDict[this._raView.currentFocus];
            var annotationInfo = this._raModel._annotationDS[this._raView.currentFocus];

            // find the reason and update its value
            _.each(ReasonsEnum, function (val, key) {
                if (args.reason == val) {
                    annotationInfo[args.type][key] = args.checked;
                }
            });
        }
    }, {
        key: '_isDone',
        value: function _isDone(eKey) {
            var annotationInfo = this._raModel._annotationDS[eKey];
            var isDone = _.every(_.values(annotationInfo), function (reasonObj) {
                // either type is false or some reason is provided if it's true
                return !reasonObj.isTrue || _.some(_.keys(ReasonsEnum), function (reasonKey) {
                    return reasonObj[reasonKey];
                });
            });
            return isDone;
        }
    }, {
        key: 'highlightErrors',
        value: function highlightErrors() {
            var _this5 = this;

            var errorMarks = [];
            _.each(this._raModel._annotationDS, function (annotationInfo, eKey) {
                if (!_this5._isDone(eKey)) errorMarks.push(_this5._raView._marksDict[eKey]);
            });

            console.log(_.map(errorMarks, function (mark) {
                return mark.$node.html();
            }));
            this._raView._highlightErrorMarks(errorMarks);

            return _.size(errorMarks);
        }
    }]);

    return RAController;
}();

/*
End of Reason Controller View 
*/

// ----------------------------------------------------------------------

/*
Utils
 */

var ReasonsEnum = {
    LOCAL_CONTEXT: 'sentence context',
    DOC_CONTEXT: 'document context',
    SURFACE_FORM: 'mention surface',
    KB: 'outside knowledge'
};

var Reason = function Reason() {
    var _this6 = this;

    _classCallCheck(this, Reason);

    this.isTrue = true;
    _.each(_.keys(ReasonsEnum), function (reason) {
        _this6[reason] = false;
    });
};

function getReasonAnnotationDS(docJson, annJson) {
    var docAnnots = {};
    _.each(docJson['sentences'], function (sentence, sIdx) {
        if (sentence.ents.length > 0) {
            _.each(sentence.ents, function (ent, eIdx) {
                var key = sIdx + '-' + ent.start + '-' + ent.end;
                docAnnots[key] = {};
                _.each(annJson.entities[key], function (_, type) {
                    docAnnots[key][type] = new Reason();
                });
            });
        }
    });
    return docAnnots;
}

function getCoarseToFine(typeHier) {
    // given the type-hier as presented in figer_type_hier.json,
    // creates a dictionary from coarse types to all its fine-types
    var getCoarse = function getCoarse(type) {
        while (typeHier.get(type)['parent'] != null) {
            type = typeHier.get(type)['parent'];
        }return type;
    };
    var coarseToFine = {};
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
        for (var _iterator = typeHier[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var _step$value = _slicedToArray(_step.value, 2),
                type = _step$value[0],
                properties = _step$value[1];

            if (typeHier.has(type)) {
                var coarse = getCoarse(type);
                // add coarse type to dictionary
                if (!coarseToFine[coarse]) coarseToFine[coarse] = [];
                // if this is a fine type add this to the coarse type list
                if (typeHier.get(type)['parent'] != null) coarseToFine[coarse].push(type);
            }
        }
        // sort the fine-types for each coarse type
    } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
    } finally {
        try {
            if (!_iteratorNormalCompletion && _iterator.return) {
                _iterator.return();
            }
        } finally {
            if (_didIteratorError) {
                throw _iteratorError;
            }
        }
    }

    _.each(coarseToFine, function (fineTypes, coarseType) {
        coarseToFine[coarseType] = _.sortBy(fineTypes, [function (t) {
            return t.split('.').pop();
        }]);
    });
    return coarseToFine;
}

// ----------------------------------------------------------------------


function getFigerHier() {
    var url = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : './figer_type_hier.json';

    return $.ajax({
        type: 'GET',
        url: url,
        dataType: 'json'
    }).then(function (response) {
        var typeHier = new Map();
        var typeAlias = new Map();
        for (var i = 0; i < response.length; i++) {
            var type_id = response[i][0];
            typeHier.set(type_id, response[i][1]);
            // alias = response[i][1]["alias"];
            if (_.has(response[i][1], "alias")) {
                typeAlias.set(type_id, response[i][1]["alias"]);
            } else {
                typeAlias.set(type_id, type_id);
            }
        }
        var coarseToFine = getCoarseToFine(typeHier);
        return {
            coarseToFine: coarseToFine,
            typeAlias: typeAlias
        };
    }, function (jqxhr, textStatus, errorThrown) {
        console.log('figer-hier promise failed');
        console.log('textStatus - ' + textStatus + ', errorThrown - ' + errorThrown);
    });
}

function getDocument() {
    var url = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : './sample_doc.json';

    return $.ajax({
        url: url,
        dataType: 'json'
    }).then(function (response) {
        // sort ents in each sentece by start
        _.each(response['sentences'], function (sentence) {
            sentence.ents.sort(function (e1, e2) {
                return e1.start - e2.start;
            });
        });
        // validate data and not load if incorrect
        return response;
    }, function (jqxhr, textStatus, errorThrown) {
        console.log('getDocument promise failed - encountered error while loading ' + url);
        console.log('textStatus - ' + textStatus + ', errorThrown - ' + errorThrown);
    });
}

function renderChar(token) {
    if (token == "-LCB-") {
        return "{";
    }

    if (token == "-RRB-") {
        return ")";
    }

    if (token == "-RCB-") {
        return "}";
    }

    if (token == "-LRB-") {
        return "(";
    }
    return token;
}

function postAnnotations(url, postQuery) {
    return $.ajax({
        type: 'POST',
        url: url + '?' + postQuery
    }).then(function () {
        console.log('successfully submitted');
    }, function () {
        console.log('something wrong with submission');
    });
}

function submit(url, assignmentId, raModel, raView, raController) {
    var feedBackText = $('#feedback').val();

    var numErrors = raController.highlightErrors();
    if (numErrors > 0) {
        // if (false) {
        var errTmpl = document.getElementById('error-template');
        var $errorbox = $(errTmpl.content.cloneNode(true));
        $errorbox.find('div.alert').append('Please finish the annotations and submit again (Click instructions for help. Incomplete ones are highlighted above)!').attr('id', 'submit-error');
        $('#submit').prepend($errorbox);
    } else {
        var postDict = raModel.annotationDStoPostDict();
        postDict['feedBackText'] = feedBackText;
        console.log(postDict);
        $('#submit-form').attr('action', url);
        $('#submit-form [name=assignmentId]').attr('value', assignmentId);
        $('#submit-form [name=data]').attr('value', JSON.stringify(postDict));
        $('#submit-form').submit();
        // postPromise.then(() => console.log('succesfully posted!'));
    }
}

function queryURL(url, name) {
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
}

var raModel, raView, raController;
var debug = {};
var figerPromise, docPromise, annotationPromise;

$(document).ready(function () {
    var docURL = queryURL(window.location.href, 'doc_url');
    var annotationURL = queryURL(window.location.href, 'doc_annotation_url');
    // const docURL = 'https://s3.amazonaws.com/finer-annotation/annotation/by_length/23/nw-wsj-10-wsj_1012.v4_gold_conll.json';
    // const annotationURL = '../data-dumps/dump1/nw-wsj-10-wsj_1012.v4_gold_conll.json';
    var postURL = queryURL(window.location.href, 'post_url');
    var assignmentId = queryURL(window.location.href, 'assignmentId');
    console.log('post_url : ' + postURL);
    console.log('assignmentId : ' + assignmentId);

    figerPromise = getFigerHier();
    docPromise = getDocument(docURL);
    annotationPromise = $.ajax({
        url: annotationURL,
        dataType: 'json'
    }).then(function (response) {
        console.log('fetched annotation data');console.log(response);return response;
    }, function (jqxhr, textStatus, errorThrown) {
        console.log('annotation promise failed - encountered error while loading ' + annotationURL);
        console.log('textStatus - ' + textStatus + ', errorThrown - ' + errorThrown);
    });

    console.log('trying to fetch doc at ' + docURL);

    $.when(figerPromise, docPromise, annotationPromise).then(function (typeInfo, docJson, annJson) {

        var coarseToFine = typeInfo["coarseToFine"];
        var typeToAlias = typeInfo["typeAlias"];
        raModel = new RAModel(docJson, annJson, coarseToFine, typeToAlias);
        raView = new RAView(raModel);
        raController = new RAController(raModel, raView);

        if (assignmentId == 'ASSIGNMENT_ID_NOT_AVAILABLE') {
            $('#submit-button').addClass('disabled');
            $('#instructionsButton').click();
        } else $('#submit-button').on('click', function () {
            return submit(postURL, assignmentId, raModel, raView, raController);
        });
    }, function () {
        //error handling if figer data is not loaded
        console.log('some error. Sorry couldn\'t load');
    });
});
