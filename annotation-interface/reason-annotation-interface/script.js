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
    attach: function(listener) {
        this._listeners.push(listener);
    },
    notify: function(args) {
        var index;

        for (index = 0; index < this._listeners.length; index += 1) {
            this._listeners[index](this._sender, args);
        }
    },
    forwardEvent: function(nextEvent) {
        // forwards this events notifications to the nextEvent
        this.attach((sender, args) => nextEvent.notify(args));
    }
};

/*
End of Event definition
 */

// ----------------------------------------------------------------------

/*
Reason Annotation Model
*/

class RAModel {

    constructor(docJson, annJson, coarseToFine, typeAlias) {
        this._docJson = docJson;
        this._annJson = annJson;
        this._coarseToFine = coarseToFine;
        this._typeAlias = typeAlias;
        this._annotationDS = getReasonAnnotationDS(docJson, annJson);
    }

    getKeyorNull(sIdx, eIdx) {
        const sentence = this._docJson.sentences[sIdx];
        if (_.isNil(sentence)) return null;
        const ent = sentence.ents[eIdx]
        if (_.isNil(ent)) return null;
        return `${sIdx}-${ent.start}-${ent.end}`;
    }

    annotationDStoPostDict() {
        let docJson = this._docJson;
        let annotationDS = this._annotationDS;
        let postDS = {};
        _.each(annotationDS, (annotationInfo, eKey) => {
            postDS[`${docJson['doc_id']}-${eKey}`] = annotationInfo;
        });
        return postDS;
    }

}

/*
End of Type Annotation Model
 */

// ----------------------------------------------------------------------

/*
Reason Annotation View 
*/

const MarkStates = _.keyBy([
    'SELECTED',
    'UNSELECTED_NOTDONE',
    'UNSELECTED_DONE',
    'UNSELECTED_ERROR'
], _.identity)

const markStateToClass = {
    [MarkStates.SELECTED]: 'selected',
    [MarkStates.UNSELECTED_NOTDONE]: '',
    [MarkStates.UNSELECTED_DONE]: 'done',
    [MarkStates.UNSELECTED_ERROR]: 'error'
};

class RAView {

    constructor(raModel) {
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

    _attachAnnotationView($node, annotationInfo) {
        const _this = this;
        const typeArr = _.sortBy(_.keys(annotationInfo))

        const annotView = $('<div id="annotation-view"></div>');
        if (_.size(typeArr) == 0) {
            const infoTmpl = document.getElementById('info-template');
            const $alertNode = $(infoTmpl.content.cloneNode(true)).find('div.alert');
            $alertNode.append('Nothing to annotate for this entity! Please skip it.');
            annotView.append($alertNode);
            $node.append(annotView);
            return;
        }

        
        _.each(typeArr, (type) => {
            const annRowTmpl = document.getElementById('annotation-row-template');
            const annRow = $(annRowTmpl.content.cloneNode(true)).find('div.annotation-row');
            annRow.find('.type-name-col').html(this._raModel._typeAlias.get(type));
            annotView.append(annRow);

            _.each(ReasonsEnum, (val, key) => {
                annRow.find(`div.reasons-col input:checkbox[value="${val}"]`)[0].checked = annotationInfo[type][key];
            });
        });
        $node.append(annotView);
        // annotView.find('div.is-true-col input').bootstrapToggle();

        // attach event triggers
        $.each( annotView.find('div.annotation-row'), function(index) {
            const annRow = $(this);
            const type = typeArr[index];
            const isTrueState = annotationInfo[type].isTrue ? 'on' : 'off';

            annRow.find('.is-true-col input').bootstrapToggle( isTrueState );
            annRow.find('.is-true-col input').change( function() {
                _this.isTrueClicked.notify( { 'type': type, 'checked': $(this).prop('checked') } );
                if (!$(this).prop('checked')) {
                    annRow.find('div.reasons-col').hide();
                }
                else {
                    annRow.find('div.reasons-col').show();
                }
            } );

            annRow.find('div.reasons-col input').change( function() {
                _this.reasonCheckBoxClicked.notify( {'type': type, 'reason': this.value, 'checked': this.checked} );
            } );

            // if isTrue is false
            if (!annotationInfo[type].isTrue) {
                annRow.find('div.reasons-col').hide();
            }
        } );
    }

    _removeAnnotationView($node) {
        $('div#annotation-view').remove();
    }

    _createMarksDict($node) {
        let marksDict = {};
        $node.find('mark[data-entity]').each( (index, markNode) => {
            let $markNode = $(markNode);
            // let sIdx = parseInt($markNode.attr('sent-id'));
            let eKey = $markNode.attr('ent-key');

            marksDict[eKey] = {$node: $markNode, state: MarkStates.UNSELECTED_NOTDONE, prevState: MarkStates.UNSELECTED_NOTDONE};
        } );
        return marksDict;
    }

    _registerClicksOnMark(marksDict) {
        _.each(marksDict, (mark, eKey) => {
            mark.$node.on('click', () => {
                this.markClicked.notify( {mark, eKey} );
            });
        });
    }

    _setMarkState(mark, state) {
        if (!_.includes(_.values(MarkStates), state)) return;
        mark.$node.attr('class', markStateToClass[state]);
        mark.prevState = mark.state;
        mark.state = state;
    }

    focusOnMark(eKey, annotationInfo) {
        const mark = this._marksDict[eKey];

        this._setMarkState(mark, MarkStates.SELECTED);
        this.currentFocus = eKey;

        // add the annotation view to the mark parent sentence view
        this._attachAnnotationView( mark.$node.closest('div.list-group-item'), annotationInfo );
    }

    unFocus() {
        if (_.isNil(this.currentFocus)) return;
        this._setMarkState( this._marksDict[this.currentFocus], MarkStates.UNSELECTED_NOTDONE );
        this._removeAnnotationView(this._marksDict[this.currentFocus].$node);
        this.currentFocus = null;
    }

    _highlightErrorMarks(marks) {
        _.each(marks, (mark) => {
            this._setMarkState(mark, MarkStates.UNSELECTED_ERROR);
        });
    }


    //--------  doc load utilities ------------

    _getSentenceHTMLElement(sentence, sIdx) {
        // return string constructed with tokens and spaces in [start, end)
        const getTextFromSpanForTokenSpaces = (tsps, st, end) => 
            _(tsps).slice(st, end).reduce((acc, tsp) => (acc + tsp[0] + tsp[1]), '');

        const wrapTextInMark = (text, ent) => 
            (`<mark data-entity ent-key="${sIdx}-${ent.start}-${ent.end}" sent-id="${sIdx}">${text}</mark>`);

        // tuples of tokens, spaces ( => zip(tokens, spaces) )
        const tokenSpaces = _.isUndefined(sentence.spaces) ? 
            _.map(sentence.tokens, (t) => [t, " "]) :
            _.zip(sentence.tokens, sentence.spaces);

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
                sentInnerHTML += wrapTextInMark(getTextFromSpan(ent.start, ent.end), ent);
                lastEntEnd = ent.end;
            });
            // add text after the last entity
            sentInnerHTML += getTextFromSpan(lastEntEnd, sentLen);
            sentNode.innerHTML = sentInnerHTML;
        }
        return sentNode;
    }

    _getDocHTMLNode(docJson) {
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
    }

    _renderDocInNode(docJson, $node) {
        var docHtml = this._getDocHTMLNode(docJson);
        $node.append(docHtml);
    }
}


/*
End of Reason Annotation View 
*/

// ----------------------------------------------------------------------

/*
Reason Controller View 
*/


class RAController {

    constructor(raModel, raView) {
        this._raModel = raModel;
        this._raView = raView;

        this._attachListenersToView(raView);
    }

    _attachListenersToView(caView) {
        raView.markClicked.attach(this._onMarkClick.bind(this));
        raView.isTrueClicked.attach(this._onIsTrueClick.bind(this));
        raView.reasonCheckBoxClicked.attach(this._onReasonCheckBoxClicked.bind(this));
    }

    _onMarkClick(sender, args) {
        console.log(`received click from ${args.eKey}`);

        const mark = args.mark;
        // console.log(mark);
        
        // currently no focused
        if (_.isNil(this._raView.currentFocus)) {
            this._raView.focusOnMark(args.eKey, this._raModel._annotationDS[args.eKey]);
        }
        else {
            const currentFocus = this._raView.currentFocus;
            // unfocus the current thing
            this._raView.unFocus();

            // clicked on the a new mark, then select it
            if (args.eKey != currentFocus) {
                this._raView.focusOnMark(args.eKey, this._raModel._annotationDS[args.eKey]);
            }
            return;
        }
    }

    _onIsTrueClick(sender, args) {
        if (_.isNil(this._raView.currentFocus)) return;

        const focusedMark = this._raView._marksDict[this._raView.currentFocus];
        const annotationInfo = this._raModel._annotationDS[this._raView.currentFocus];

        annotationInfo[args.type].isTrue = args.checked;
        if (!args.checked) {
            _.each(ReasonsEnum, (val, key) => {
                annotationInfo[args.type][key] = false;
            });
        }
    }

    _onReasonCheckBoxClicked(sender, args) {
        if (_.isNil(this._raView.currentFocus)) return;

        const focusedMark = this._raView._marksDict[this._raView.currentFocus];
        const annotationInfo = this._raModel._annotationDS[this._raView.currentFocus];

        // find the reason and update its value
        _.each(ReasonsEnum, (val, key) => {
            if (args.reason == val) {
                annotationInfo[args.type][key] = args.checked;
            }
        });
    }

    highlightErrors() {
        let errorMarks = [];
        _.each(this._raModel._annotationDS, (annotationInfo, eKey) => {
            const isCorrect = _.every(_.values(annotationInfo), reasonObj => {
                // either type is false or some reason is provided if it's true
                return (!reasonObj.isTrue) || _.some(_.keys(ReasonsEnum), reasonKey => reasonObj[reasonKey]);
            });
            if (!isCorrect) errorMarks.push(this._raView._marksDict[eKey]);
        });

        console.log(_.map(errorMarks, mark => mark.$node.html()));
        this._raView._highlightErrorMarks(errorMarks);

        return _.size(errorMarks);
    }

}


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
}


class Reason {
    constructor() {
        this.isTrue = true;
        _.each(_.keys(ReasonsEnum),
            (reason) => {this[reason] = false});
    }
}


function getReasonAnnotationDS(docJson, annJson) {
    var docAnnots = {};
    _.each(docJson['sentences'], (sentence, sIdx) => {
        if (sentence.ents.length > 0) {
            _.each(sentence.ents, (ent, eIdx) => {
                const key = `${sIdx}-${ent.start}-${ent.end}`;
                docAnnots[key] = {}
                _.each(annJson.entities[key], (_, type) => {
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
    _.each(coarseToFine, function(fineTypes, coarseType) {
        coarseToFine[coarseType] = _.sortBy(fineTypes, [(t) => t.split('.').pop()]);
    });
    return coarseToFine;
}


// ----------------------------------------------------------------------


function getFigerHier(url = './figer_type_hier.json') {
    return $.ajax({
        type: 'GET',
        url: url,
        dataType: 'json'
    }).then(
        (response) => {
            let typeHier = new Map();
            let typeAlias = new Map();
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
        },
        (jqxhr,textStatus,errorThrown) => {
            console.log('figer-hier promise failed');
            console.log(`textStatus - ${textStatus}, errorThrown - ${errorThrown}`);
        }
    );
}


function getDocument(url = './sample_doc.json') {
    return $.ajax({
        url: url,
        dataType: 'json'
    }).then(
        (response) => {
            // sort ents in each sentece by start
            _.each(response['sentences'], function(sentence) {
                sentence.ents.sort(function(e1, e2) {
                    return e1.start - e2.start
                });
            });
            // validate data and not load if incorrect
            return response;
        },
        (jqxhr,textStatus,errorThrown) => {
            console.log(`getDocument promise failed - encountered error while loading ${url}`);
            console.log(`textStatus - ${textStatus}, errorThrown - ${errorThrown}`);
        }
    );
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
        url: `${url}?${postQuery}`
    }).then(() => {
        console.log('successfully submitted')
    }, () => {
        console.log('something wrong with submission')
    });
}

function submit(url, assignmentId, raModel, raView, raController) {
    const feedBackText = $('#feedback').val();

    const numErrors = raController.highlightErrors();
    if (numErrors > 0) {
    // if (false) {
        const errTmpl = document.getElementById('error-template');
        let $errorbox = $(errTmpl.content.cloneNode(true));
        $errorbox
            .find('div.alert')
            .append(`Please finish the annotations and submit again (Click instructions for help. Incomplete ones are highlighted above)!`)
            .attr('id', 'submit-error');
        $('#submit').prepend($errorbox);
    } else {
        const postDict = raModel.annotationDStoPostDict();
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

$(document).ready(function() {
    // const docURL = queryURL(window.location.href, 'doc_url');
    // const annotationURL = queryURL(window.location.href, 'doc_annotation_url');
    const docURL = 'https://s3.amazonaws.com/finer-annotation/annotation/by_length/23/nw-wsj-10-wsj_1012.v4_gold_conll.json';
    const annotationURL = '../data-dumps/dump1/nw-wsj-10-wsj_1012.v4_gold_conll.json';
    const postURL = queryURL(window.location.href, 'post_url');
    const assignmentId = queryURL(window.location.href, 'assignmentId');
    console.log(`post_url : ${postURL}`);
    console.log(`assignmentId : ${assignmentId}`);

    figerPromise = getFigerHier();
    docPromise = getDocument(docURL);
    annotationPromise = $.ajax({
        url: annotationURL,
        dataType: 'json'
    }).then(
        (response) => {console.log('fetched annotation data'); console.log(response); return response}, 
        (jqxhr,textStatus,errorThrown) => {
            console.log(`annotation promise failed - encountered error while loading ${annotationURL}`);
            console.log(`textStatus - ${textStatus}, errorThrown - ${errorThrown}`);
        }
    );

    console.log(`trying to fetch doc at ${docURL}`);

    $.when(figerPromise, docPromise, annotationPromise).then(
        (typeInfo, docJson, annJson) => {

            var coarseToFine = typeInfo["coarseToFine"];
            var typeToAlias = typeInfo["typeAlias"];
            raModel = new RAModel(docJson, annJson, coarseToFine, typeToAlias);
            raView = new RAView(raModel);
            raController = new RAController(raModel, raView);

            if (assignmentId == 'ASSIGNMENT_ID_NOT_AVAILABLE') {
                $('#submit-button').addClass('disabled')
                $('#instructionsButton').click();
            }
            else
                $('#submit-button').on('click', () => submit(postURL, assignmentId, raModel, raView, raController));
        },
        () => {
            //error handling if figer data is not loaded
            console.log(`some error. Sorry couldn't load`)
        }
    );
});