FROM public.ecr.aws/lambda/python:3.12

COPY lambda_mail_handler/requirements.txt ${LAMBDA_TASK_ROOT}/
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

COPY core/ ${LAMBDA_TASK_ROOT}/core/
COPY config.json ${LAMBDA_TASK_ROOT}/
COPY lambda_mail_handler/handler.py ${LAMBDA_TASK_ROOT}/

CMD ["handler.lambda_handler"]
