'use strict';

// constants

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

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
Type Annotation Model
*/

function TAModel(docJson, coarseToFine, typeAlias) {
    this._docJson = docJson;
    this._coarseToFine = coarseToFine;
    this._typeAlias = typeAlias;
    this._annotationDS = getAnnotationDS(docJson);

    this.coarseTypeAdded = new Event(this);
    this.coarseTypeRemoved = new Event(this);
    this.fineTypeAdded = new Event(this);
    this.fineTypeRemoved = new Event(this);
    this.fineTypesReset = new Event(this);
}

TAModel.prototype = {

    get: function get(sIdx, eIdx) {
        if (!this.checkValidIdxs(sIdx, eIdx)) return null;
        return this._annotationDS[sIdx][eIdx];
    },

    checkValidIdxs: function checkValidIdxs(sIdx, eIdx) {
        return !_.isUndefined(this._annotationDS[sIdx]) && !_.isUndefined(this._annotationDS[sIdx][eIdx]);
    },

    checkValidCoarseType: function checkValidCoarseType(coarseType) {
        return _.has(this._coarseToFine, coarseType) || coarseType == NO_TYPE;
    },

    checkValidFineType: function checkValidFineType(coarseType, fineType) {
        return _.includes(this._coarseToFine[coarseType], fineType) || fineType == NO_TYPE;
    },

    setCoarseType: function setCoarseType(sIdx, eIdx, coarseType) {
        if (this.checkValidIdxs(sIdx, eIdx) && this.checkValidCoarseType(coarseType)) {

            // if there's a previous type
            var prevCoarseType = this._annotationDS[sIdx][eIdx].coarseType;
            if (prevCoarseType == coarseType) return;
            if (prevCoarseType) this.removeCoarseType(sIdx, eIdx, prevCoarseType);

            this._annotationDS[sIdx][eIdx].coarseType = coarseType;

            var notifyObj = {
                sIdx: sIdx,
                eIdx: eIdx,
                coarseType: coarseType
            };
            this.coarseTypeAdded.notify(notifyObj);
        }
    },

    removeCoarseType: function removeCoarseType(sIdx, eIdx, coarseType) {
        if (this.checkValidIdxs(sIdx, eIdx) && this.checkValidCoarseType(coarseType) && this._annotationDS[sIdx][eIdx].coarseType == coarseType) {

            this._annotationDS[sIdx][eIdx].coarseType = null;

            var notifyObj = {
                sIdx: sIdx,
                eIdx: eIdx,
                coarseType: coarseType
            };
            this.coarseTypeRemoved.notify(notifyObj);

            this._annotationDS[sIdx][eIdx].fineTypes = [];
            this.fineTypesReset.notify(notifyObj);
        }
    },

    setFineType: function setFineType(sIdx, eIdx, fineType) {
        if (this.checkValidIdxs(sIdx, eIdx)) {
            var coarseType = this._annotationDS[sIdx][eIdx].coarseType;
            if (this.checkValidFineType(coarseType, fineType) && !_.includes(this._annotationDS[sIdx][eIdx], fineType)) {

                this._annotationDS[sIdx][eIdx].fineTypes.push(fineType);
                this.fineTypeAdded.notify({
                    sIdx: sIdx,
                    eIdx: eIdx,
                    fineType: fineType
                });
            }
        }
    },

    removeFineType: function removeFineType(sIdx, eIdx, fineType) {
        if (this.checkValidIdxs(sIdx, eIdx)) {
            var coarseType = this._annotationDS[sIdx][eIdx].coarseType;
            if (this.checkValidFineType(coarseType, fineType)) {

                var index = this._annotationDS[sIdx][eIdx].fineTypes.indexOf(fineType);
                if (index == -1) return;
                this._annotationDS[sIdx][eIdx].fineTypes.splice(index, 1);
                this.fineTypeRemoved.notify({
                    sIdx: sIdx,
                    eIdx: eIdx,
                    fineType: fineType
                });
            }
        }
    },

    annotationDStoPostDict: function annotationDStoPostDict() {
        var docJson = this._docJson;
        var annotationDS = this._annotationDS;
        var postDS = {};
        _.each(annotationDS, function (nestedDict, sIdx) {
            _.each(nestedDict, function (types, eIdx) {
                var ent = docJson.sentences[sIdx].ents[eIdx];
                var val = _.concat([types.coarseType], types.fineTypes).join('-');
                postDS[docJson['doc_id'] + '-' + sIdx + '-' + ent.start + '-' + ent.end] = val;
            });
        });
        return postDS;
    }

};

/*
End of Type Annotation Model
 */

// var taModel = new TAModel(globalStore.docJson, globalStore.coarseToFine);

// ----------------------------------------------------------------------

/*
Type Annotation View 
*/

function TAView(taModel, tAWindowView) {
    this._taModel = taModel;

    this._$docRoot = $('div#doc-view');
    this._renderDocInNode(taModel._docJson, this._$docRoot);
    this._marksDict = this._createMarksDict(this._$docRoot);

    this.tAWindowView = new TAWindowView(taModel._coarseToFine, taModel._typeAlias);

    // events
    this.markClicked = new Event(this);

    this.coarseTypeSelected = new Event(this);
    this.coarseTypeUnselected = new Event(this);
    this.fineTypeSelected = new Event(this);
    this.fineTypeUnselected = new Event(this);

    this._registerTypeEventsToWindowView();
    this._registerClicksOnMark(this._marksDict);
}

TAView.prototype = {

    MarkStates: {
        SELECTED: 0,
        UNSELECTED_NOTDONE: 1,
        UNSELECTED_DONE: 2,
        UNSELECTED_ERROR: 3,
        associatedClass: {
            0: 'selected',
            1: '',
            2: 'done',
            3: 'error'
        },
        isSelect: {
            0: true,
            1: false,
            2: false,
            3: false
        }
    },

    highlightErrorMarks: function highlightErrorMarks() {
        var _this2 = this;

        var _this = this;
        var errCount = 0;
        _.each(_this._marksDict, function (nestedDict, sIdx) {
            _.each(nestedDict, function (mark, eIdx) {
                if (mark.state == _this2.MarkStates.UNSELECTED_NOTDONE || mark.state == _this2.MarkStates.UNSELECTED_ERROR) {
                    _this.setMarkStateAndRender(sIdx, eIdx, _this2.MarkStates.UNSELECTED_ERROR);
                    errCount += 1;
                }
            });
        });
        return errCount;
    },

    getMark: function getMark(sIdx, eIdx) {
        if (_.has(this._marksDict, sIdx) && _.has(this._marksDict[sIdx], eIdx)) return this._marksDict[sIdx][eIdx];
        return null;
    },

    setMarkStateAndRender: function setMarkStateAndRender(sIdx, eIdx, markState) {
        var _this = this;
        if (_this._taModel.checkValidIdxs(sIdx, eIdx) && _.includes(_.values(_this.MarkStates), markState)) {
            var mark = _this._marksDict[sIdx][eIdx];
            mark.state = markState;
            // set the appropriate class
            mark.node.attr('class', _this.MarkStates.associatedClass[markState]);
            if (_this.MarkStates.isSelect[markState]) {
                _this.tAWindowView.attachToNode($('div#sentence-' + sIdx));
                _this.tAWindowView.setSelected(this._taModel.get(sIdx, eIdx));
            } else {
                _this.tAWindowView.removeFromDOM();
            }
        }
    },

    _registerClicksOnMark: function _registerClicksOnMark(marksDict) {
        var _this = this;
        _.each(marksDict, function (nestedDict, sIdx) {
            _.each(nestedDict, function (mark, eIdx) {
                mark.node.on('click', function () {
                    _this.markClicked.notify({
                        sIdx: sIdx,
                        eIdx: eIdx,
                        mark: mark
                    });
                });
            });
        });
    },

    _registerTypeEventsToWindowView: function _registerTypeEventsToWindowView() {
        var tAWindowView = this.tAWindowView;
        tAWindowView.coarseTypeSelected.forwardEvent(this.coarseTypeSelected);
        tAWindowView.coarseTypeUnselected.forwardEvent(this.coarseTypeUnselected);
        tAWindowView.fineTypeSelected.forwardEvent(this.fineTypeSelected);
        tAWindowView.fineTypeUnselected.forwardEvent(this.fineTypeUnselected);
    },

    _createMarksDict: function _createMarksDict($node) {
        var marksDict = {};
        var _this = this;
        $node.find('mark[data-entity]').each(function (index, mark) {
            var $mark = $(mark);
            var sIdx = $mark.attr('sent-id');
            var eIdx = $mark.attr('ent-id');

            if (!_.has(marksDict, sIdx)) marksDict[sIdx] = {};
            marksDict[sIdx][eIdx] = {
                node: $mark,
                state: _this.MarkStates.UNSELECTED_NOTDONE
            };
        });
        return marksDict;
    },

    //--------  doc load utilities ------------

    _getSentenceHTMLElement: function _getSentenceHTMLElement(sentence, sIdx) {
        // return string constructed with tokens and spaces in [start, end)
        var getTextFromSpanForTokenSpaces = function getTextFromSpanForTokenSpaces(tsps, st, end) {
            return _(tsps).slice(st, end).reduce(function (acc, tsp) {
                return acc + tsp[0] + tsp[1];
            }, '');
        };

        var wrapTextInMark = function wrapTextInMark(text, eIdx) {
            return '<mark data-entity ent-id="' + eIdx + '" sent-id="' + sIdx + '">' + text + '</mark>';
        };

        // tuples of tokens, spaces ( => zip(tokens, spaces) )
        var tokens = _.map(sentence.tokens, renderChar);
        var tokenSpaces = _.isUndefined(sentence.spaces) ? _.map(tokens, function (t) {
            return [t, " "];
        }) : _.zip(tokens, sentence.spaces);

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
                sentInnerHTML += wrapTextInMark(getTextFromSpan(ent.start, ent.end), eIdx);
                lastEntEnd = ent.end;
            });
            // add text after the last entity
            sentInnerHTML += getTextFromSpan(lastEntEnd, sentLen);
            sentNode.innerHTML = sentInnerHTML;
        }
        return sentNode;
    },

    _getDocHTMLNode: function _getDocHTMLNode(docJson) {
        // listItem template
        var sentTmpl = document.getElementById('sentence-template');
        var $group = $('<div>', {
            'class': 'list-group'
        });

        var _this = this;
        _.each(docJson['sentences'], function (sentence, sIdx) {
            var $sc = $(sentTmpl.content.cloneNode(true));
            $sc.find('div.sentence-content').append(_this._getSentenceHTMLElement(sentence, sIdx));
            $sc.find('span.sentence-list-index').text(parseInt(sIdx) + 1);

            var $li = $('<div>', {
                'class': 'list-group-item'
            }).append($sc).attr('id', 'sentence-' + sIdx);
            $group.append($li);
        });
        return $group[0];
    },

    _renderDocInNode: function _renderDocInNode(docJson, $node) {
        var docHtml = this._getDocHTMLNode(docJson);
        $node.append(docHtml);
    }

};

// ----------------

/*
Type Annotation Window View - the window which drops
*/

function TAWindowView(coarseToFine, typeAlias) {
    this._coarseToFine = coarseToFine;
    this._typeAlias = typeAlias;

    this.coarseTypeSelected = new Event(this);
    this.coarseTypeUnselected = new Event(this);
    this.fineTypeSelected = new Event(this);
    this.fineTypeUnselected = new Event(this);

    // state
    // map from typename to jquery node
    this._coarseTypeToNode = {};
    this._fineTypeToNode = {};
    this._coarseSelected = null;
    this._attachedToDOM = false;

    this._$typerow = this._getTypeOptionsHTMLNode(coarseToFine, typeAlias);
}

TAWindowView.prototype = {
    attachToNode: function attachToNode($node) {
        var _this3 = this;

        if (this._attachedToDOM) this.removeFromDOM();
        this._$typerow.promise().then(function () {
            $node.append(_this3._$typerow);
            _this3._$typerow.hide();
            _this3._$typerow.slideDown(200);
            _this3._attachedToDOM = true;
        });
        this._attachedToDOM = true;
        return this._$typerow.promise();
    },

    removeFromDOM: function removeFromDOM() {
        var _this4 = this;

        if (this._attachedToDOM) {
            this._$typerow.promise().then(function () {
                _this4._$typerow.slideUp(0);
                var promise = _this4._$typerow.promise();
                promise.done(function () {
                    return _this4._$typerow.detach();
                });
            });
            this._attachedToDOM = false;
        }
        return this._$typerow.promise();
    },

    clearSelected: function clearSelected() {
        if (_.isString(this._coarseSelected)) this._onCoarseTypeClick(this._coarseTypeToNode[this._coarseSelected], false);
    },

    setSelected: function setSelected(args) {
        var _this5 = this;

        var coarseType = args.coarseType;
        this.clearSelected();
        if (!_.has(this._coarseTypeToNode, coarseType)) return;
        this._onCoarseTypeClick(this._coarseTypeToNode[coarseType], false);
        var _this = this;
        _.each(args.fineTypes, function (fineType) {
            if (_.has(_this5._fineTypeToNode, fineType)) _this5._onFineTypeClick(_this5._fineTypeToNode[fineType], false);
        });
    },

    _toggleTypeButton: function _toggleTypeButton($btn) {
        if (!$btn.hasClass('disabled')) {
            if ($btn.hasClass('btn-primary') || $btn.hasClass('btn-success')) $btn.toggleClass('btn-primary btn-success selected');else if ($btn.hasClass('btn-warning')) {
                $btn.toggleClass('selected');
            }
        }
    },

    _renderFineTypeHtmlInNode: function _renderFineTypeHtmlInNode($node, coarseType) {
        var _this6 = this;

        var liTmpl = document.getElementById('type-list-item-template');
        // reset finetypes map
        this._fineTypeToNode = {};
        var $li;
        var _this = this;
        if (_.has(this._coarseToFine, coarseType) && this._coarseToFine[coarseType].length > 0) {
            _.each(_.concat(this._coarseToFine[coarseType], NO_TYPE), function (fineType) {
                $li = $(liTmpl.content.cloneNode(true));

                var displayTypeName = fineType;
                if (NO_TYPE != displayTypeName) {
                    displayTypeName = _this6._typeAlias.get(displayTypeName);
                }

                displayTypeName = displayTypeName.split('.').pop();
                displayTypeName = displayTypeName.toUpperCase();

                $li.find('div.btn').attr('value', fineType).addClass('fine-type').text(displayTypeName);
                $li.find('div.btn').on('click', function () {
                    _this._onFineTypeClick($(this));
                });
                _this._fineTypeToNode[fineType] = $li.find('div.btn');
                if (fineType == NO_TYPE) $li.find('div.btn').addClass('no-type btn-warning').removeClass('btn-primary');
                $node.append($li);
            });
        } else {
            var infoTmpl = document.getElementById('info-template');
            var $infobox = $(infoTmpl.content.cloneNode(true));
            $infobox.find('div.alert').append('No Fine Types found for <strong>' + coarseType + '</strong>!');
            $node.append($infobox);
        }
    },

    _onCoarseTypeClick: function _onCoarseTypeClick($liCoarse) {
        var notify = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

        var _this = this;

        this._toggleTypeButton($liCoarse);
        var coarseType = $liCoarse.attr('value');
        var $fineCol = $liCoarse.closest('.type-row').find('#fine-types-col');
        $fineCol.find('.col-heading').text(coarseType + ' types');
        $fineCol.find('.col-content').empty();
        if ($liCoarse.hasClass('selected')) {
            this._coarseSelected = coarseType;
            // remove selected for any other coarse type
            $liCoarse.siblings('div.btn').each(function (i, thatliCoarse) {
                var $thatliCoarse = $(thatliCoarse);
                if (thatliCoarse != $liCoarse[0] && $thatliCoarse.hasClass('selected')) _this._toggleTypeButton($thatliCoarse);
            });

            this._renderFineTypeHtmlInNode($fineCol.find('.col-content'), coarseType);
            if (notify) this.coarseTypeSelected.notify({
                coarseType: coarseType
            });
        } else {
            this._coarseSelected = null;
            $fineCol.find('.col-heading').text('No coarse type selected');
            if (notify) this.coarseTypeUnselected.notify({
                coarseType: coarseType
            });
        }
    },

    _onFineTypeClick: function _onFineTypeClick($liFine) {
        var notify = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

        this._toggleTypeButton($liFine);
        if (!notify) return;
        var fineType = $liFine.attr('value');
        $liFine.hasClass('selected') ? this.fineTypeSelected.notify({
            fineType: fineType
        }) : this.fineTypeUnselected.notify({
            fineType: fineType
        });
    },

    _getTypeOptionsHTMLNode: function _getTypeOptionsHTMLNode(coarseToFine, typeAlias) {
        var $root = $($.parseHTML('<div class="type-select-wrapper" id="type-window"></div>'));
        var curColsCount = 0;
        var liTmpl = document.getElementById('type-list-item-template');

        var $typerow = $(document.getElementById('type-row-template').content.cloneNode(true));
        var $colcontent = $typerow.find('#coarse-types-col .col-content');

        var coarseTypesSorted = _.sortBy(_.keys(coarseToFine), function (t) {
            return -coarseToFine[t].length;
        });

        var $li;
        var _this = this;
        _.each(_.concat(coarseTypesSorted, NO_TYPE), function (coarseType) {
            $li = $(liTmpl.content.cloneNode(true));
            var displayTypeName = coarseType;
            if (NO_TYPE != displayTypeName) {
                displayTypeName = typeAlias.get(displayTypeName);
            }

            displayTypeName = displayTypeName.toUpperCase();

            $li.find('div.btn').attr('value', coarseType).addClass('coarse-type').text(displayTypeName);

            $li.find('div.btn').on('click', function () {
                _this._onCoarseTypeClick($(this));
            });
            _this._coarseTypeToNode[coarseType] = $li.find('div.btn');
            if (coarseType == NO_TYPE) $li.find('div.btn').addClass('no-type btn-warning').removeClass('btn-primary');
            $colcontent.append($li);
        });

        $root.append($typerow);
        return $root;
    }
};

/*
End of Type Annotation View 
*/

// ----------------------------------------------------------------------


/*
Type Annotation Controller
*/

function TAController(taModel, taView) {
    this._taModel = taModel;
    this._taView = taView;

    this._markSelectedIdx = null;
    this.addViewListeners();
}

TAController.prototype = {
    addViewListeners: function addViewListeners() {
        this._taView.markClicked.attach(this.onMarkClick.bind(this));
        this._taView.coarseTypeSelected.attach(this.onCoarseTypeSelected.bind(this));
        this._taView.coarseTypeUnselected.attach(this.onCoarseTypeUnselected.bind(this));
        // this._taView.coarseTypeUnselected.attach((sender, args) => console.log(`coarseTypeUnselected - ${JSON.stringify(args)}`));
        this._taView.fineTypeSelected.attach(this.onFineTypeSelected.bind(this));
        this._taView.fineTypeUnselected.attach(this.onFineTypeUnselected.bind(this));
    },

    onMarkClick: function onMarkClick(sender, args) {
        var _this = this;
        var mark = args.mark;
        if (_.isNil(mark)) return;
        var MarkStates = TAView.prototype.MarkStates;

        var isDone = function isDone(curAnn) {
            if (_.isNil(curAnn.coarseType)) return false;
            var availableFineTypes = _this._taModel._coarseToFine[curAnn.coarseType];
            return !(!_.isNil(availableFineTypes) && availableFineTypes.length > 0 && curAnn.fineTypes.length == 0);
        };

        var unSelectMark = function unSelectMark(sIdx, eIdx) {
            var mark = _this._taView.getMark(sIdx, eIdx);
            if (mark.state != MarkStates.SELECTED) return;
            var curAnn = _this._taModel.get(sIdx, eIdx);
            var nextState = isDone(curAnn) ? TAView.prototype.MarkStates.UNSELECTED_DONE : TAView.prototype.MarkStates.UNSELECTED_NOTDONE;
            _this._taView.setMarkStateAndRender(sIdx, eIdx, nextState);
        };

        var selectMark = function selectMark(sIdx, eIdx) {
            var mark = _this._taView.getMark(sIdx, eIdx);
            if (mark.state == MarkStates.SELECTED) return;
            _this._taView.setMarkStateAndRender(sIdx, eIdx, MarkStates.SELECTED);
            _this._markSelectedIdx = {
                sIdx: sIdx,
                eIdx: eIdx
            };
        };

        // what to do on each mark state
        if (mark.state == MarkStates.SELECTED) {
            // unselect the mark
            unSelectMark(args.sIdx, args.eIdx);
            _this._markSelectedIdx = null;
        } else if (_.includes([MarkStates.UNSELECTED_NOTDONE, MarkStates.UNSELECTED_DONE, MarkStates.UNSELECTED_ERROR], mark.state)) {
            // if some other mark selected, deselect it first
            if (!_.isNil(_this._markSelectedIdx)) {
                unSelectMark(_this._markSelectedIdx.sIdx, _this._markSelectedIdx.eIdx);
            }
            selectMark(args.sIdx, args.eIdx);
            this._markSelectedIdx = {
                sIdx: args.sIdx,
                eIdx: args.eIdx
            };
        }
    },

    onCoarseTypeSelected: function onCoarseTypeSelected(sender, args) {
        if (!_.isNil(this._markSelectedIdx)) this._taModel.setCoarseType(this._markSelectedIdx.sIdx, this._markSelectedIdx.eIdx, args.coarseType);
    },

    onCoarseTypeUnselected: function onCoarseTypeUnselected(sender, args) {
        if (!_.isNil(this._markSelectedIdx)) this._taModel.removeCoarseType(this._markSelectedIdx.sIdx, this._markSelectedIdx.eIdx, args.coarseType);
    },

    onFineTypeSelected: function onFineTypeSelected(sender, args) {
        if (!_.isNil(this._markSelectedIdx)) this._taModel.setFineType(this._markSelectedIdx.sIdx, this._markSelectedIdx.eIdx, args.fineType);
    },

    onFineTypeUnselected: function onFineTypeUnselected(sender, args) {
        if (!_.isNil(this._markSelectedIdx)) this._taModel.removeFineType(this._markSelectedIdx.sIdx, this._markSelectedIdx.eIdx, args.fineType);
    }
};

/*
End of Type Annotation Controller
 */

// ----------------------------------------------------------------------

/*
Utils
 */
function getAnnotationDS(docJson) {
    var docAnnots = {};
    _.each(docJson['sentences'], function (sentence, sIdx) {
        if (sentence.ents.length > 0) {
            docAnnots[sIdx] = {};
            _.each(sentence.ents, function (ent, eIdx) {
                docAnnots[sIdx][eIdx] = {
                    'coarseType': null,
                    'fineTypes': []
                };
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

function submit(url, assignmentId, taModel, taView, taController) {
    var feedBackText = $('#feedback').val();

    var numErrors = taView.highlightErrorMarks();
    if (numErrors > 0) {
        var errTmpl = document.getElementById('error-template');
        var $errorbox = $(errTmpl.content.cloneNode(true));
        $errorbox.find('div.alert').append('Please finish the annotations and submit again (Click instructions for help. Incomplete ones are highlighted above)!').attr('id', 'submit-error');
        $('#submit').prepend($errorbox);
    } else {
        var postDict = taModel.annotationDStoPostDict();
        postDict['feedBackText'] = feedBackText;
        // const queryString = $.param(postDict);
        // console.log(`post string: ${queryString}`)
        // const postPromise = postAnnotations(url, queryString);
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

var taModel, taView, tAWindowView, taController;
var debug = {};
var figerPromise, docPromise;
$(document).ready(function () {
    var docURL = queryURL(window.location.href, 'doc_url');
    var postURL = queryURL(window.location.href, 'post_url');
    var assignmentId = queryURL(window.location.href, 'assignmentId');
    console.log('post_url : ' + postURL);
    console.log('assignmentId : ' + assignmentId);

    figerPromise = getFigerHier();
    docPromise = getDocument(docURL);

    console.log('trying to fetch doc at ' + docURL);

    $.when(figerPromise, docPromise).then(function (typeInfo, docJson) {
        // console.log(typeInfo);
        // console.log(typeInfo["coarseToFine"])
        // console.log(typeInfo.coarseToFine)
        var coarseToFine = typeInfo["coarseToFine"];
        var typeToAlias = typeInfo["typeAlias"];
        taModel = new TAModel(docJson, coarseToFine, typeToAlias);
        taView = new TAView(taModel);
        taController = new TAController(taModel, taView);

        // debug event listeners
        // taModel.coarseTypeAdded.attach( (sender, args) => console.log(`coarse type added: ${args.coarseType}`) );
        // taModel.coarseTypeRemoved.attach( (sender, args) => console.log(`coarse type removed: ${args.coarseType}`) );
        // taModel.fineTypeAdded.attach( (sender, args) => console.log(`fine type added: ${args.fineType}`) );
        // taModel.fineTypeRemoved.attach( (sender, args) => console.log(`fine type removed: ${args.fineType}`) );
        // taModel.fineTypesReset.attach( (sender, args) => console.log(`cleared fine types`) );

        if (assignmentId == 'ASSIGNMENT_ID_NOT_AVAILABLE') {
            $('#submit-button').addClass('disabled');
            $('#instructionsButton').click();
        } else $('#submit-button').on('click', function () {
            return submit(postURL, assignmentId, taModel, taView, taController);
        });
    }, function () {
        //error handling if figer data is not loaded
        console.log('some error. Sorry couldn\'t load');
    });
});
