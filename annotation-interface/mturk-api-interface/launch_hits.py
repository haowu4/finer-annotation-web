from __future__ import print_function

import codecs
from argparse import ArgumentParser
import urlparse
from urllib import urlencode
import yaml
import json
import datetime

from boto.mturk.connection import MTurkConnection
from boto.mturk.question import ExternalQuestion
from boto.mturk.price import Price

from utils import extract_doc_url_paths_of_length


if __name__ == '__main__':

    parser = ArgumentParser(description='launch HITS to MTurk')
    parser.add_argument('--config', '-c', required=True, type=str,
                        help='path to config yaml file')
    parser.add_argument('--entity-lengths', '-l', required=True, type=int,
                        nargs='+',
                        help='selects documents with #entities in the \
                              list provided',
                        dest='num_ents_list')
    parser.add_argument('--production', '-p', action='store_true',
                        help='use production params',
                        dest='production')
    parser.add_argument('--verbose', '-v', action='store_true',
                        dest='verbose')
    parser.add_argument('--max-docs-per-length', '-m', type=int,
                        default=10,
                        dest='max_docs',
                        help='maximum number of documents per #entities \
                              provided in --entity-lengths')
    args = parser.parse_args()

    if args.verbose:
        print('args:')
        print(json.dumps(vars(args), indent=4, sort_keys=True))
        print('')

    with codecs.open(args.config, mode='rb', encoding='utf-8') as f_in:
        config = yaml.load(f_in.read())

    if args.verbose:
        print('config from %s:' % (args.config))
        print(json.dumps(config, indent=4, sort_keys=True))
        print('')

    host = 'mechanicalturk.sandbox.amazonaws.com' \
        if not args.production else 'mechanicalturk.amazonaws.com'
    post_url = 'https://workersandbox.mturk.com/mturk/externalSubmit' \
        if not args.production \
        else 'https://www.mturk.com/mturk/externalSubmit'

    print('using submission host : %s' % host)
    print('post url : %s' % post_url)
    print('')

    print('trying to connect with [%s]... ' % (config['profile-name']), end='')
    mturkConnection = MTurkConnection(
        profile_name=config['profile-name'], host=host)
    if mturkConnection is None:
        print("couldn't connect! quit()")
        exit()
    else:
        print('successfully established connection to api\n')

    doc_url_paths = [url for num_ents in args.num_ents_list
                     for url in
                     extract_doc_url_paths_of_length(num_ents)[:args.max_docs]]

    annotation_url = config['hit-annotation-base-url']

    print('fetched %d urls satisfying constraints\n' % (len(doc_url_paths)))
    # print json.dumps(doc_url_paths, indent=4)

    for i, doc_url_path in enumerate(doc_url_paths, 1):

        url_parts = list(urlparse.urlparse(annotation_url))
        query = dict(urlparse.parse_qsl(url_parts[4]))
        query.update({'post_url': post_url, 'doc_url': doc_url_path})
        url_parts[4] = urlencode(query)

        externalQuestionURL = urlparse.urlunparse(url_parts)

        questionform = ExternalQuestion(
            externalQuestionURL, config['frame-height'])

        create_hit_result = mturkConnection.create_hit(
            question=questionform,
            lifetime=datetime.timedelta(**config['hit-lifetime']),
            max_assignments=config['hit-max-assignments'],
            title=config['hit-title'],
            description=config['hit-description'],
            keywords=config['hit-keywords'],
            reward=Price(amount=config['hit-reward']),
            duration=datetime.timedelta(**config['hit-duration']),
            approval_delay=datetime.timedelta(**config['hit-approval-delay']),
            qualifications=None,
            response_groups=('Minimal', 'HITDetail')
        )

        print('[%3d] posted HIT pointing to %s' % (i, externalQuestionURL))

    # all_hits = [hit for hit in connection.get_all_hits()]

    # be careful. disable_hit accepts the submitted hits!!!!!!
    # [mturkConnection.expire_hit(hit.HITId) for hit in all_hits]
    # [mturkConnection.disable_hit(hit.HITId) for hit in all_hits]

    # see how to put advanced config
    # how long I have before I accept
