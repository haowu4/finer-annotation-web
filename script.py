import spacy
import codecs
import json


def contains(big_span, small_span):
    return big_span.start <= small_span.start \
        and big_span.end >= small_span.end


def doc_to_dict(doc, doc_id="", meta_data=None):
    def ent_to_dict(ent, offset):
        return {'start': ent.start - offset,
                'end': ent.end - offset, 'label': ent.label_}

    sents_dict = {}
    ents = doc.ents
    for i, sent in enumerate(doc.sents):
        sents_dict[i] = {
            'tokens': [token.text for token in sent],
            'spaces': [token.text_with_ws[len(token.text):] for token in sent],
            'ents': [ent_to_dict(ent, sent.start)
                     for ent in ents if contains(sent, ent)]
        }
    return {'doc_id': doc_id, 'meta_data': meta_data, 'sentences': sents_dict}


if __name__ == '__main__':
    nlp = spacy.load('en')
    with codecs.open("sample_doc.txt", encoding='utf-8') as f_in:
        doc_text = f_in.read()
    doc = nlp(doc_text)

    doc_dict = doc_to_dict(doc)
    with codecs.open("sample_doc.json", mode='w', encoding='utf-8') as f_out:
        json.dump(doc_dict, f_out)
