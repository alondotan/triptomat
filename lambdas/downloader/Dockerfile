FROM public.ecr.aws/lambda/python:3.12

RUN dnf install -y tar gzip xz && \
    curl -L --retry 5 --retry-delay 10 -o /tmp/ffmpeg.tar.xz https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz && \
    tar -xJ --strip-components=2 -C /usr/local/bin/ -f /tmp/ffmpeg.tar.xz --wildcards '*/bin/ffmpeg' '*/bin/ffprobe' && \
    rm /tmp/ffmpeg.tar.xz

COPY lambdas/downloader/requirements.txt ${LAMBDA_TASK_ROOT}/
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

COPY core/ ${LAMBDA_TASK_ROOT}/core/
COPY lambdas/downloader/handler.py ${LAMBDA_TASK_ROOT}/

CMD ["handler.lambda_handler"]
