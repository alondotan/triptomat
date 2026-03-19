FROM public.ecr.aws/lambda/python:3.12

COPY lambdas/whatsapp/requirements.txt ${LAMBDA_TASK_ROOT}/
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

COPY core/ ${LAMBDA_TASK_ROOT}/core/
COPY config.json ${LAMBDA_TASK_ROOT}/
COPY lambdas/whatsapp/handler.py ${LAMBDA_TASK_ROOT}/
COPY lambdas/whatsapp/meta_api.py ${LAMBDA_TASK_ROOT}/
COPY lambdas/whatsapp/classifier.py ${LAMBDA_TASK_ROOT}/
COPY lambdas/whatsapp/handlers/ ${LAMBDA_TASK_ROOT}/handlers/

CMD ["handler.lambda_handler"]
