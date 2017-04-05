from __future__ import print_function
import os
import boto
from argparse import ArgumentParser
import urllib2
import json
from keras.utils.generic_utils import Progbar


def extract_doc_url_paths_of_length(
        length,
        bucket_name='finer-annotation',
        prefix='annotation/by_length',
        profile_name='cogcomp'):
    connection = boto.connect_s3(profile_name=profile_name)
    bucket = connection.get_bucket(bucket_name)

    prefixLen = len(prefix)
    url_paths = []
    for keyObj in bucket.list(prefix):
        keyLen = int(keyObj.name[prefixLen:].split("/")[1])
        if (keyLen == length):
            url_path = os.path.join(keyObj.bucket.name, keyObj.name)
            url_paths.append(url_path)

    return map(lambda path: 'https://s3.amazonaws.com/' + path, url_paths)


def extract_annotation_url_paths_for_doc_urls(
        doc_urls,
        bucket_name='finer-annotation',
        prefix='data-dumps/dump1_4',
        profile_name='cogcomp'):
    connection = boto.connect_s3(profile_name=profile_name)
    bucket = connection.get_bucket(bucket_name)

    doc_json_names = map(os.path.basename, doc_urls)

    annotation_urls = []
    for basename in doc_json_names:
        # Check if key exists in bucket. If not make it None
        if bucket.get_key(prefix + '/' + basename) is None:
            annotation_urls.append(None)
        else:
            annotation_urls.append('https://s3.amazonaws.com/' +
                                   bucket_name + '/' + prefix + '/' + basename)
    return annotation_urls


def build_doc_id_to_url_map(
        profile_name='cogcomp',
        bucket_name='finer-annotation',
        prefix='annotation/by_length'):
    connection = boto.connect_s3(profile_name=profile_name)
    bucket = connection.get_bucket(bucket_name)
    bucket.list()
    url_paths = []
    for keyObj in bucket.list(prefix):
        url_path = os.path.join(
            'https://s3.amazonaws.com/', keyObj.bucket.name, keyObj.name)
        url_paths.append(url_path)
    print('Found %d docs. Fetching, parsing jsons and building map... ' %
          len(url_paths))
    progbar = Progbar(len(url_paths))
    errors = 0
    doc_id_to_url_map = {}
    for url_path in url_paths:
        try:
            response = urllib2.urlopen(url_path)
            doc_id = json.loads(response.read())['doc_id']
            doc_id_to_url_map[doc_id] = url_path
        except Exception:
            errors += 1
        progbar.add(1)
    print('Done with %d errors' % errors)

    return doc_id_to_url_map


if __name__ == '__main__':

    parser = ArgumentParser()
    parser.add_argument('--lengths', '-l', required=True, type=int,
                        nargs=2, dest='lengths_list')
    args = parser.parse_args()
    args.lengths_list = range(args.lengths_list[0], args.lengths_list[1] + 1)

    total_docs = 0
    all_doc_urls = []
    for length in args.lengths_list:
        doc_urls = extract_doc_url_paths_of_length(length)
        all_doc_urls.extend(doc_urls)
        print("#docs of length %d = %d" % (length, len(doc_urls)))
        # print ''
        # print '\n'.join(docs[:3])

    print("#total docs of lenghts %s = %d" % (args.lengths_list,
                                              len(all_doc_urls)))

    annotation_urls = extract_annotation_url_paths_for_doc_urls(all_doc_urls)
    print("#missing annotation urls = %d" %
          (len([url for url in annotation_urls if url is None])))
