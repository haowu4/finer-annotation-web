'use strict';

// constants
const NO_TYPE = 'No_Type';


/*
Event defintion
 */
function Event(sender) {
    this._sender = sender;
    this._listeners = [];
}

Event.prototype = {
    attach : function (listener) {
        this._listeners.push(listener);
    },
    notify : function (args) {
        var index;

        for (index = 0; index < this._listeners.length; index += 1) {
            this._listeners[index](this._sender, args);
        }
    },
    forwardEvent : function (nextEvent) {
        // forwards this events notifications to the nextEvent
        this.attach((sender, args) => nextEvent.notify(args));
    }
};

/*
End of Event definition
 */

// ----------------------------------------------------------------------

/*
Type Annotation Model
*/ 

function TAModel(docJson, coarseToFine) {
    this._docJson = docJson;
    this._coarseToFine = coarseToFine;
    this._annotationDS = getAnnotationDS(docJson);

    this.coarseTypeAdded = new Event(this);
    this.coarseTypeRemoved = new Event(this);
    this.fineTypeAdded = new Event(this);
    this.fineTypeRemoved = new Event(this);
    this.fineTypesReset = new Event(this);
}

TAModel.prototype = {

    get: function(sIdx, eIdx) {
        if (!this.checkValidIdxs(sIdx, eIdx)) return null;
        return this._annotationDS[sIdx][eIdx]; 
    },

    checkValidIdxs: function(sIdx, eIdx) {
        return (!_.isUndefined(this._annotationDS[sIdx]) &&
                !_.isUndefined(this._annotationDS[sIdx][eIdx]));
    },

    checkValidCoarseType: function(coarseType) {
        return _.has(this._coarseToFine, coarseType) || coarseType == NO_TYPE;
    },

    checkValidFineType: function(coarseType, fineType) {
        return _.includes(this._coarseToFine[coarseType], fineType) || fineType == NO_TYPE;
    },

    setCoarseType: function(sIdx, eIdx, coarseType) {
        if (this.checkValidIdxs(sIdx, eIdx) && this.checkValidCoarseType(coarseType)) {

            // if there's a previous type
            const prevCoarseType = this._annotationDS[sIdx][eIdx].coarseType;
            if (prevCoarseType == coarseType) return;
            if (prevCoarseType) this.removeCoarseType(sIdx, eIdx, prevCoarseType);

            this._annotationDS[sIdx][eIdx].coarseType = coarseType;

            const notifyObj = {sIdx: sIdx, eIdx: eIdx, coarseType: coarseType};
            this.coarseTypeAdded.notify(notifyObj);
        }
    },

    removeCoarseType: function(sIdx, eIdx, coarseType) {
        if (this.checkValidIdxs(sIdx, eIdx) &&
            this.checkValidCoarseType(coarseType) &&
            this._annotationDS[sIdx][eIdx].coarseType == coarseType) {
            
            this._annotationDS[sIdx][eIdx].coarseType = null;

            const notifyObj = {sIdx: sIdx, eIdx: eIdx, coarseType: coarseType};
            this.coarseTypeRemoved.notify( notifyObj );

            this._annotationDS[sIdx][eIdx].fineTypes = [];
            this.fineTypesReset.notify(notifyObj);
        }
    },

    setFineType: function(sIdx, eIdx, fineType) {
        if (this.checkValidIdxs(sIdx, eIdx)) {
            const coarseType =  this._annotationDS[sIdx][eIdx].coarseType;
            if (this.checkValidFineType(coarseType, fineType) &&
                !_.includes(this._annotationDS[sIdx][eIdx], fineType)) {

                this._annotationDS[sIdx][eIdx].fineTypes.push(fineType);
                this.fineTypeAdded.notify( {sIdx: sIdx, eIdx: eIdx, fineType: fineType} );
            }
        }
    },

    removeFineType: function(sIdx, eIdx, fineType) {
        if (this.checkValidIdxs(sIdx, eIdx)) {
            const coarseType =  this._annotationDS[sIdx][eIdx].coarseType;
            if (this.checkValidFineType(coarseType, fineType)) {

                const index = this._annotationDS[sIdx][eIdx].fineTypes.indexOf(fineType);
                if (index == -1) return;
                this._annotationDS[sIdx][eIdx].fineTypes.splice(index, 1);
                this.fineTypeRemoved.notify( {sIdx: sIdx, eIdx: eIdx, fineType: fineType} );
            }
        }
    },

    annotationDStoString: function() {
        let docJson = this._docJson;
        let annotationDS = this._annotationDS;
        let postDS = {};
        _.each(annotationDS, (nestedDict, sIdx) => {
            _.each(nestedDict, (types, eIdx) => {
                const ent = docJson.sentences[sIdx].ents[eIdx];
                let val = _.concat([types.coarseType], types.fineTypes).join('-');
                postDS[`${docJson['doc_id']}-${sIdx}-${ent.start}-${ent.end}`] = val;
            })
        });
        return $.param(postDS);
    }

}

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

    this.tAWindowView = new TAWindowView(taModel._coarseToFine);

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

    highlightErrorMarks: function() {
        const _this = this;
        let errCount = 0;
        _.each(_this._marksDict, (nestedDict, sIdx) => {
            _.each(nestedDict, (mark, eIdx) => {
                if (mark.state == this.MarkStates.UNSELECTED_NOTDONE || mark.state == this.MarkStates.UNSELECTED_ERROR) {
                    _this.setMarkStateAndRender(sIdx, eIdx, this.MarkStates.UNSELECTED_ERROR);
                    errCount += 1;
                }
            })
        });
        return errCount;
    },

    getMark: function(sIdx, eIdx) {
        if (_.has(this._marksDict, sIdx) && _.has(this._marksDict[sIdx], eIdx))
            return this._marksDict[sIdx][eIdx];
        return null;
    },

    setMarkStateAndRender: function(sIdx, eIdx, markState) {
        const _this = this;
        if (_this._taModel.checkValidIdxs(sIdx, eIdx) && _.includes(_.values(_this.MarkStates), markState)) {
            const mark = _this._marksDict[sIdx][eIdx];
            mark.state = markState;
            // set the appropriate class
            mark.node.attr('class', _this.MarkStates.associatedClass[markState]);
            if (_this.MarkStates.isSelect[markState]) {
                _this.tAWindowView.attachToNode($(`div#sentence-${sIdx}`));
                _this.tAWindowView.setSelected(this._taModel.get(sIdx, eIdx));
            }
            else {
                _this.tAWindowView.removeFromDOM();
            }
        }
    },

    _registerClicksOnMark: function(marksDict) {
        const _this = this;
        _.each(marksDict, (nestedDict, sIdx) => {
            _.each(nestedDict, (mark, eIdx) => {
                mark.node.on('click', function() {
                    _this.markClicked.notify( {sIdx: sIdx, eIdx: eIdx, mark: mark} )
                })
            })
        });
    },

    _registerTypeEventsToWindowView: function() {
        let tAWindowView = this.tAWindowView;
        tAWindowView.coarseTypeSelected.forwardEvent(this.coarseTypeSelected);
        tAWindowView.coarseTypeUnselected.forwardEvent(this.coarseTypeUnselected);
        tAWindowView.fineTypeSelected.forwardEvent(this.fineTypeSelected);
        tAWindowView.fineTypeUnselected.forwardEvent(this.fineTypeUnselected);
    },

    _createMarksDict: function($node) {
        let marksDict = {};
        const _this = this;
        $node.find('mark[data-entity]').each( function(index, mark) {
            let $mark = $(mark);
            let sIdx = $mark.attr('sent-id');
            let eIdx = $mark.attr('ent-id');

            if (!_.has(marksDict, sIdx)) marksDict[sIdx] = {};
            marksDict[sIdx][eIdx] = {node: $mark, state: _this.MarkStates.UNSELECTED_NOTDONE};
        } );
        return marksDict;
    },

    //--------  doc load utilities ------------

    _getSentenceHTMLElement: function(sentence, sIdx) {
        // return string constructed with tokens and spaces in [start, end)
        const getTextFromSpanForTokenSpaces = (tsps, st, end) => 
            _(tsps).slice(st, end).reduce((acc, tsp) => (acc + tsp[0] + tsp[1]), '');

        const wrapTextInMark = (text, eIdx) => 
            (`<mark data-entity ent-id="${eIdx}" sent-id="${sIdx}">${text}</mark>`);

        // tuples of tokens, spaces ( => zip(tokens, spaces) )
        const tokens = _.map(sentence.tokens, renderChar);
        const tokenSpaces = _.isUndefined(sentence.spaces) ? 
            _.map(tokens, (t) => [t, " "]) :
            _.zip(tokens, sentence.spaces);

        const getTextFromSpan = _.partial(getTextFromSpanForTokenSpaces, tokenSpaces);

        const sentLen = tokenSpaces.length;
        const ents = sentence.ents;

        const sentNode = document.createElement('div');
        // now populate sentNode with sentence contents by iterating through ents
        if (ents.length == 0)
            sentNode.innerText = getTextFromSpan(0, sentLen);
        else {
            let sentInnerHTML = "";
            let lastEntEnd = 0;
            _.each(ents, (ent, eIdx) => {
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

    _getDocHTMLNode: function(docJson) {
        // listItem template
        const sentTmpl = document.getElementById('sentence-template');
        let $group = $('<div>', {'class': 'list-group'});

        const _this = this;
        _.each(docJson['sentences'], (sentence, sIdx) => {
            let $sc = $(sentTmpl.content.cloneNode(true));
            $sc.find('div.sentence-content')
                .append(_this._getSentenceHTMLElement(sentence, sIdx));
            $sc.find('span.sentence-list-index').text(parseInt(sIdx)+1)

            let $li = $('<div>', {'class': 'list-group-item'}).
                append($sc).attr('id', 'sentence-'+sIdx);
            $group.append($li);
        });
        return $group[0];
    },

    _renderDocInNode: function(docJson, $node) {
        var docHtml = this._getDocHTMLNode(docJson);
        $node.append(docHtml);
    }

}

// ----------------

/*
Type Annotation Window View - the window which drops
*/


function TAWindowView(coarseToFine) {
    this._coarseToFine = coarseToFine;

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

    this._$typerow = this._getTypeOptionsHTMLNode(coarseToFine);
}

TAWindowView.prototype = {
    attachToNode: function($node) {
        if (this._attachedToDOM)
            this.removeFromDOM();
        this._$typerow.promise().then(() => {
            $node.append(this._$typerow);
            this._$typerow.hide();
            this._$typerow.slideDown(200);
            this._attachedToDOM = true;
        });
        this._attachedToDOM = true;
        return this._$typerow.promise();
    },

    removeFromDOM: function() {
        if (this._attachedToDOM) {
            this._$typerow.promise().then(() => {
                this._$typerow.slideUp(0);
                const promise = this._$typerow.promise();
                promise.done(() => this._$typerow.detach());
            });
            this._attachedToDOM = false;
        }
        return this._$typerow.promise();
    },

    clearSelected: function() {
        if (_.isString(this._coarseSelected))
            this._onCoarseTypeClick(this._coarseTypeToNode[this._coarseSelected], false);
    },

    setSelected: function(args) {
        const coarseType = args.coarseType;
        this.clearSelected();
        if (!_.has(this._coarseTypeToNode, coarseType)) return;
        this._onCoarseTypeClick(this._coarseTypeToNode[coarseType], false);
        const _this = this;
        _.each(args.fineTypes, (fineType) => {
            if (_.has(this._fineTypeToNode, fineType))
                this._onFineTypeClick(this._fineTypeToNode[fineType], false);
        });
    },

    _toggleTypeButton: function($btn) {
        if (!$btn.hasClass('disabled')) {
            if ($btn.hasClass('btn-primary') || $btn.hasClass('btn-success'))
                $btn.toggleClass('btn-primary btn-success selected');
            else if ($btn.hasClass('btn-warning')) {
                $btn.toggleClass('selected');
            }
        }
    },

    _renderFineTypeHtmlInNode: function($node, coarseType) {
        const liTmpl = document.getElementById('type-list-item-template');
        // reset finetypes map
        this._fineTypeToNode = {};
        var $li;
        const _this = this;
        if (_.has(this._coarseToFine, coarseType) && this._coarseToFine[coarseType].length > 0) {
            _.each(_.concat(this._coarseToFine[coarseType], NO_TYPE), (fineType) => {
                $li = $(liTmpl.content.cloneNode(true)); 
                $li.find('div.btn').attr('value', fineType).addClass('fine-type').text(fineType.split('.').pop().toUpperCase());
                $li.find('div.btn').on( 'click', function() { _this._onFineTypeClick($(this)) } );
                _this._fineTypeToNode[fineType] = $li.find('div.btn');
                if (fineType == NO_TYPE)
                    $li.find('div.btn').addClass('no-type btn-warning').removeClass('btn-primary');
                $node.append($li);
            });
        }
        else {
            const infoTmpl = document.getElementById('info-template');
            let $infobox = $(infoTmpl.content.cloneNode(true));
            $infobox.find('div.alert').append(`No Fine Types found for <strong>${coarseType}</strong>!`)
            $node.append($infobox);
        }
    },

    _onCoarseTypeClick: function($liCoarse, notify=true) {
        const _this = this;

        this._toggleTypeButton($liCoarse);
        let coarseType = $liCoarse.attr('value');
        let $fineCol = $liCoarse.closest('.type-row').find('#fine-types-col');
        $fineCol.find('.col-heading').text(coarseType + ' types');
        $fineCol.find('.col-content').empty();
        if ($liCoarse.hasClass('selected')) {
            this._coarseSelected = coarseType;
            // remove selected for any other coarse type
            $liCoarse.siblings('div.btn').each(function(i, thatliCoarse) {
                let $thatliCoarse = $(thatliCoarse);
                if (thatliCoarse != $liCoarse[0] && $thatliCoarse.hasClass('selected'))
                    _this._toggleTypeButton($thatliCoarse);
            });
            
            this._renderFineTypeHtmlInNode($fineCol.find('.col-content'), coarseType);
            if (notify)
                this.coarseTypeSelected.notify({coarseType: coarseType});
        }
        else {
            this._coarseSelected = null;
            $fineCol.find('.col-heading').text('No coarse type selected');
            if (notify)
                this.coarseTypeUnselected.notify({coarseType: coarseType});
        }
    },

    _onFineTypeClick: function($liFine, notify=true) {
        this._toggleTypeButton($liFine);
        if (!notify) return;
        const fineType = $liFine.attr('value');
        $liFine.hasClass('selected') ?
            this.fineTypeSelected.notify({fineType: fineType}) : 
            this.fineTypeUnselected.notify({fineType: fineType});
    },

    _getTypeOptionsHTMLNode: function(coarseToFine) {
        let $root = $($.parseHTML('<div class="type-select-wrapper" id="type-window"></div>'));
        let curColsCount = 0;
        const liTmpl = document.getElementById('type-list-item-template');

        let $typerow = $(document.getElementById('type-row-template').content.cloneNode(true));
        let $colcontent = $typerow.find('#coarse-types-col .col-content');

        let coarseTypesSorted = _.sortBy(_.keys(coarseToFine), function(t) {
            return -coarseToFine[t].length});

        var $li;
        const _this = this;
        _.each(_.concat(coarseTypesSorted, NO_TYPE), function(coarseType) {
            $li = $(liTmpl.content.cloneNode(true)); 
            $li.find('div.btn').attr('value', coarseType).addClass('coarse-type').text(coarseType.toUpperCase());
            
            $li.find('div.btn').on('click', function() { 
                _this._onCoarseTypeClick($(this)) } );
            _this._coarseTypeToNode[coarseType] = $li.find('div.btn');
            if (coarseType == NO_TYPE)
                $li.find('div.btn').addClass('no-type btn-warning').removeClass('btn-primary');
            $colcontent.append($li);
        });

        $root.append($typerow);
        return $root;
    }
}


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
    addViewListeners: function() {
        this._taView.markClicked.attach(this.onMarkClick.bind(this));
        this._taView.coarseTypeSelected.attach(this.onCoarseTypeSelected.bind(this));
        this._taView.coarseTypeUnselected.attach(this.onCoarseTypeUnselected.bind(this));
        // this._taView.coarseTypeUnselected.attach((sender, args) => console.log(`coarseTypeUnselected - ${JSON.stringify(args)}`));
        this._taView.fineTypeSelected.attach(this.onFineTypeSelected.bind(this));
        this._taView.fineTypeUnselected.attach(this.onFineTypeUnselected.bind(this));
    },

    onMarkClick: function(sender, args) {
        const _this = this;
        const mark = args.mark;
        if (_.isNil(mark)) return;
        const MarkStates = TAView.prototype.MarkStates;

        const isDone = (curAnn) => {
            if (_.isNil(curAnn.coarseType)) return false;
            const availableFineTypes = _this._taModel._coarseToFine[curAnn.coarseType];
            return !(!_.isNil(availableFineTypes) && availableFineTypes.length > 0 && curAnn.fineTypes.length == 0);
        };

        const unSelectMark = (sIdx, eIdx) => {
            const mark = _this._taView.getMark(sIdx, eIdx);
            if (mark.state != MarkStates.SELECTED) return;
            const curAnn = _this._taModel.get(sIdx, eIdx);
            const nextState = isDone(curAnn)
                                ? TAView.prototype.MarkStates.UNSELECTED_DONE
                                : TAView.prototype.MarkStates.UNSELECTED_NOTDONE;
            _this._taView.setMarkStateAndRender(sIdx, eIdx, nextState);
        };

        const selectMark = (sIdx, eIdx) => {
            const mark = _this._taView.getMark(sIdx, eIdx);
            if (mark.state == MarkStates.SELECTED) return;
            _this._taView.setMarkStateAndRender(sIdx, eIdx, MarkStates.SELECTED);
            _this._markSelectedIdx = {sIdx: sIdx, eIdx: eIdx}
        }

        // what to do on each mark state
        if (mark.state == MarkStates.SELECTED) {
            // unselect the mark
            unSelectMark(args.sIdx, args.eIdx);
            _this._markSelectedIdx = null;
        }
        else if (_.includes([MarkStates.UNSELECTED_NOTDONE, MarkStates.UNSELECTED_DONE, MarkStates.UNSELECTED_ERROR], mark.state)) {
            // if some other mark selected, deselect it first
            if (!_.isNil(_this._markSelectedIdx)) {
                unSelectMark(_this._markSelectedIdx.sIdx, _this._markSelectedIdx.eIdx);
            }
            selectMark(args.sIdx, args.eIdx);
            this._markSelectedIdx = {sIdx: args.sIdx, eIdx: args.eIdx};
        }
    },

    onCoarseTypeSelected: function(sender, args) {
        if (!_.isNil(this._markSelectedIdx))
            this._taModel.setCoarseType(this._markSelectedIdx.sIdx, this._markSelectedIdx.eIdx, args.coarseType);
    },

    onCoarseTypeUnselected: function(sender, args) {
        if (!_.isNil(this._markSelectedIdx))
            this._taModel.removeCoarseType(this._markSelectedIdx.sIdx, this._markSelectedIdx.eIdx, args.coarseType);
    },

    onFineTypeSelected: function(sender, args) {
        if (!_.isNil(this._markSelectedIdx))
            this._taModel.setFineType(this._markSelectedIdx.sIdx, this._markSelectedIdx.eIdx, args.fineType);
    },

    onFineTypeUnselected: function(sender, args) {
        if (!_.isNil(this._markSelectedIdx))
            this._taModel.removeFineType(this._markSelectedIdx.sIdx, this._markSelectedIdx.eIdx, args.fineType);
    },
}

/*
End of Type Annotation Controller
 */

// ----------------------------------------------------------------------

/*
Utils
 */
function getAnnotationDS(docJson) {
    var docAnnots = {};
    _.each(docJson['sentences'], (sentence, sIdx) => {
        if (sentence.ents.length > 0) {
            docAnnots[sIdx] = {};
            _.each(sentence.ents, (ent, eIdx) => {
                docAnnots[sIdx][eIdx] = { 'coarseType': null, 'fineTypes': [] };
            });
        }
    });
    return docAnnots;
}

function getCoarseToFine(typeHier) {
    // given the type-hier as presented in figer_type_hier.json,
    // creates a dictionary from coarse types to all its fine-types
    var getCoarse = function(type) {
        while (typeHier.get(type)['parent'] != null)
            type = typeHier.get(type)['parent'];
        return type;
    }
    var coarseToFine = {};
    for (var [type, properties] of typeHier) {
        if (typeHier.has(type)) {
            var coarse = getCoarse(type);
            // add coarse type to dictionary
            if (!coarseToFine[coarse])
                coarseToFine[coarse] = []
            // if this is a fine type add this to the coarse type list
            if (typeHier.get(type)['parent'] != null)
                coarseToFine[coarse].push(type)
        }
    }
    // sort the fine-types for each coarse type
    _.each(coarseToFine, function(fineTypes, coarseType) { fineTypes.sort() });
    return coarseToFine;
}


// ----------------------------------------------------------------------


function getFigerHier(url='./figer_type_hier.json') {
    return $.ajax({
        type: 'GET',
        url: url,
        dataType: 'jsonp'
    }).then(
        (response) => {
            let typeHier = new Map();
            for (var i = 0; i < response.length; i++)
                typeHier.set(response[i][0], response[i][1]);
            let coarseToFine = getCoarseToFine(typeHier);
            return coarseToFine;
        },
        () => null
    );
}


function getDocument(url='./sample_doc.json') {
    return $.ajax({
        url: url,
        dataType: 'json'
    }).then(
        (response) => {
            // sort ents in each sentece by start
            _.each(response['sentences'], function(sentence) {
                sentence.ents.sort(function(e1, e2) {
                    return e1.start - e2.start});
            });
            // validate data and not load if incorrect
            return response;
        },
        () => null
    );
}

function renderChar(token) {
    if(token == "-LCB-"){
        return "{";
    }

    if(token == "-RRB-"){
        return ")";
    }

    if(token == "-RCB-"){
        return "}";
    }

    if(token == "-LRB-"){
        return "(";
    }
    return token;
}


function postAnnotations(url, postQuery) {
    return $.ajax({
        type: 'POST',
        url: `${url}?${postQuery}`
    });
}

function submit(url, taModel, taView, taController) {
    const numErrors = taView.highlightErrorMarks();
    if (numErrors > 0) {
        const errTmpl = document.getElementById('error-template');
        let $errorbox = $(errTmpl.content.cloneNode(true));
        $errorbox
            .find('div.alert')
            .append(`Please finish the annotations and submit again (Click instructions for help. Incomplete ones are highlighted above)!`)
            .attr('id', 'submit-error');
        $('#submit').prepend($errorbox);
    }
    else {
        const annotationString = taModel.annotationDStoString();
        const postPromise = postAnnotations(url, annotationString);
        postPromise.then(() => console.log('succesfully posted!'));
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
$(document).ready( function() {
    const docURL = queryURL(window.location.href, 'doc_url');

    let figerPromise = getFigerHier();
    let docPromise = getDocument(docURL);

    console.log(`trying to fetch doc at ${docURL}`);

    $.when( figerPromise, docPromise ).then(
        ( coarseToFine, docJson ) => {

            taModel = new TAModel(docJson, coarseToFine);
            taView = new TAView(taModel);
            taController = new TAController(taModel, taView);

            // debug event listeners
            // taModel.coarseTypeAdded.attach( (sender, args) => console.log(`coarse type added: ${args.coarseType}`) );
            // taModel.coarseTypeRemoved.attach( (sender, args) => console.log(`coarse type removed: ${args.coarseType}`) );
            // taModel.fineTypeAdded.attach( (sender, args) => console.log(`fine type added: ${args.fineType}`) );
            // taModel.fineTypeRemoved.attach( (sender, args) => console.log(`fine type removed: ${args.fineType}`) );
            // taModel.fineTypesReset.attach( (sender, args) => console.log(`cleared fine types`) );

            $('#submit-button').on('click', () => submit('http://localhost:8000', taModel, taView, taController));
        },
        () => { 
            //error handling if figer data is not loaded
            console.log(`some error. Sorry couldn't load`)
        }
    );
});