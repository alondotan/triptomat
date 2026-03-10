FROM public.ecr.aws/lambda/python:3.12

COPY lambdas/admin/requirements.txt ${LAMBDA_TASK_ROOT}/
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

COPY core/ ${LAMBDA_TASK_ROOT}/core/
COPY lambdas/admin/handler.py ${LAMBDA_TASK_ROOT}/

CMD ["handler.lambda_handler"]
