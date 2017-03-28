import os
import boto
from argparse import ArgumentParser


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


if __name__ == '__main__':

    parser = ArgumentParser()
    parser.add_argument('--length', '-l', required=True, type=int)
    args = parser.parse_args()

    docs = extract_doc_url_paths_of_length(args.length)
    print "#docs of length %d = %d" % (args.length, len(docs))
    print ''
    print '\n'.join(docs[:3])
