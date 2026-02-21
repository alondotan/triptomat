FROM public.ecr.aws/lambda/python:3.12

RUN dnf install -y tar gzip xz && \
    curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz | \
    tar -xJ --strip-components=1 -C /usr/local/bin/ --wildcards '*/ffmpeg' '*/ffprobe'

COPY lambda_downloader/requirements.txt ${LAMBDA_TASK_ROOT}/
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

COPY core/ ${LAMBDA_TASK_ROOT}/core/
COPY lambda_downloader/handler.py ${LAMBDA_TASK_ROOT}/

CMD ["handler.lambda_handler"]
