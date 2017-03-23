import os
from docopt import docopt
import urlparse
from urllib import urlencode
import boto
from boto.mturk.connection import MTurkConnection
from boto.mturk.question import ExternalQuestion
from boto.mturk.price import Price


# if os.environ.get("I_AM_IN_DEV_ENV"):
#     HOST = 'mechanicalturk.sandbox.amazonaws.com'
# else:
#     HOST = 'mechanicalturk.amazonaws.com'

HOST = 'mechanicalturk.sandbox.amazonaws.com'


def extract_doc_url_paths(of_length, prefix='annotation/by_length'):
    connection = boto.connect_s3(profile_name='cogcomp')
    bucket = connection.get_bucket('finer-annotation')

    prefixLen = len(prefix)
    url_paths = []
    for keyObj in bucket.list(prefix):
        keyLen = int(keyObj.name[prefixLen:].split("/")[1])
        if (keyLen == of_length):
            url_path = os.path.join(keyObj.bucket.name, keyObj.name)
            url_paths.append(url_path)

    return url_paths


if __name__ == '__main__':
    args = docopt("""Generate HITS for mturk with documents with certain number of entities
    Usage:
    launch_hits.py <annotation_url> <ent_length> [-m MAX_POST] [--production]

    Options:
    --production  If false will be run in sandbox [default: False]
    -m MAX_POST --maxpost=MAX_POST  Maximum HITS to post [default: 5]

    <annotation_url> = url where the annotation resides
    <ent_length> = length of entitites you want to be considered
    """)

    print args
    # exit()

    is_sandbox = not args['--production']

    HOST = 'mechanicalturk.sandbox.amazonaws.com' if is_sandbox else 'mechanicalturk.amazonaws.com'
    postURL = 'https://workersandbox.mturk.com/mturk/externalSubmit' if is_sandbox else 'https://www.mturk.com/mturk/externalSubmit'
    print('using submission host : %s' % HOST)
    print('post url : %s' % postURL)

    mturkConnection = MTurkConnection(profile_name='pavan', host=HOST)

    base_doc_url = 'https://s3.amazonaws.com/'
    title = "Identify the type(category) of highlighted mention in text"
    description = "Mention denoting entities such as people (John Smith), locations (USA, Paris) etc. are highlighted and you have indicate which type they are (person, location etc.)"
    keywords = ['entity', 'text', 'nlp', 'type', 'annotation', 'NER', 'document', 'AI', 'mining']

    frame_height = 1500
    amount = 0.05
    
    doc_url_paths = extract_doc_url_paths(int(args['<ent_length>']))
    annotation_url = args['<annotation_url>']

    num_posted = 0
    exit()
    for doc_url_path in doc_url_paths:
        if num_posted >= int(args['--maxpost']):
            break
        
        doc_url = os.path.join(base_doc_url, doc_url_path)

        url_parts = list(urlparse.urlparse(annotation_url))
        query = dict(urlparse.parse_qsl(url_parts[4]))
        query.update({'post_url': postURL, 'doc_url': doc_url})
        url_parts[4] = urlencode(query)

        externalQuestionURL = urlparse.urlunparse(url_parts)

        
        questionform = ExternalQuestion(externalQuestionURL, frame_height)
    
        # continue
        create_hit_result = mturkConnection.create_hit(
            title=title,
            description=description,
            keywords=keywords,
            max_assignments=1,
            question=questionform,
            reward=Price(amount=amount),
            response_groups=('Minimal', 'HITDetail')
        )

        print('posted HIT pointing to %s' % externalQuestionURL)

        num_posted += 1

    # all_hits = [hit for hit in connection.get_all_hits()]

    # be careful. disable_hit accepts the submitted hits!!!!!!
    # [mturkConnection.expire_hit(hit.HITId) for hit in all_hits] 
    # [mturkConnection.disable_hit(hit.HITId) for hit in all_hits] 


    # see how to put advanced config
    # how long I have before I accept

