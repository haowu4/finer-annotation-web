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
from utils import extract_annotation_url_paths_for_doc_urls


if __name__ == '__main__':

    parser = ArgumentParser(description='launch HITS to MTurk')
    parser.add_argument('--config', '-c', required=True, type=str,
                        help='path to config yaml file')
    parser.add_argument('--entity-lengths', '-l', required=True, type=int,
                        nargs=2,
                        help='selects documents with #entities in the \
                              list provided',
                        dest='num_ents_list')
    parser.add_argument('--production', '-p', action='store_true',
                        help='use production params',
                        dest='production')
    parser.add_argument('--verbose', '-v', action='store_true',
                        dest='verbose')
    parser.add_argument('--max-docs-per-length', '-m', type=int,
                        default=-1,
                        dest='max_docs',
                        help='maximum number of documents per #entities \
                              provided in --entity-lengths')
    args = parser.parse_args()

    assert args.num_ents_list[1] >= args.num_ents_list[0], 'high < low'
    args.num_ents_list = [i for i in xrange(args.num_ents_list[0],
                                            args.num_ents_list[1] + 1)]

    if args.verbose:
        print('args:')
        print(json.dumps(vars(args), indent=4, sort_keys=True))
        print('')

    with codecs.open(args.config, mode='rb', encoding='utf-8') as f_in:
        config = yaml.load(f_in.read())

    include_annotation_urls = 's3-doc-annotation-prefix' in config

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

    doc_urls = []
    for num_ents in args.num_ents_list:
        urls = extract_doc_url_paths_of_length(
            num_ents,
            bucket_name=config['s3-bucket'],
            prefix=config['s3-docbylength-prefix'],
            profile_name=config['s3-profile-name']
        )
        if args.max_docs > 0:
            urls = extract_doc_url_paths_of_length(num_ents)[:args.max_docs]
        doc_urls.extend(urls)

    if include_annotation_urls:
        doc_annotation_urls = extract_annotation_url_paths_for_doc_urls(
            doc_urls,
            bucket_name=config['s3-bucket'],
            prefix=config['s3-doc-annotation-prefix'],
            profile_name=config['s3-profile-name']
        )
    else:
        doc_annotation_urls = [None] * len(doc_urls)

    hit_annotation_base_url = config['hit-annotation-base-url']

    print('fetched %d urls satisfying constraints\n' % (len(doc_urls)))
    # print json.dumps(doc_urls, indent=4)

    annotation_none_errs = 0
    for i, (doc_url, doc_annotation_url) in \
            enumerate(zip(doc_urls, doc_annotation_urls), 1):

        url_parts = list(urlparse.urlparse(hit_annotation_base_url))
        query = dict(urlparse.parse_qsl(url_parts[4]))
        if include_annotation_urls:
            if doc_annotation_url is None:
                annotation_none_errs += 1
                continue
            query.update(
                {'post_url': post_url,
                 'doc_url': doc_url,
                 'doc_annotation_url': doc_annotation_url})
        else:
            query.update(
                {'post_url': post_url,
                 'doc_url': doc_url})
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

    if include_annotation_urls:
        print('\n')
        print('[%3d] docs have missing annotation urls' %
              (annotation_none_errs))

    # all_hits = [hit for hit in connection.get_all_hits()]

    # be careful. disable_hit accepts the submitted hits!!!!!!
    # [mturkConnection.expire_hit(hit.HITId) for hit in all_hits]
    # [mturkConnection.disable_hit(hit.HITId) for hit in all_hits]

    # see how to put advanced config
    # how long I have before I accept
