"""Pydantic models for input validation across Lambda handlers."""

from typing import Literal, Optional

from pydantic import BaseModel, Field, HttpUrl, model_validator


class GatewayRequest(BaseModel):
    url: Optional[HttpUrl] = None
    text: Optional[str] = Field(None, max_length=50000)
    overwrite: bool = False
    webhook_token: Optional[str] = Field(None, min_length=1, max_length=128)

    @model_validator(mode="after")
    def url_or_text_required(self):
        if not self.url and not self.text:
            raise ValueError("Either url or text is required")
        return self


class AnalysisMessage(BaseModel):
    job_id: str
    url: str
    source_type: Literal["video", "maps", "web"]
    source_metadata: dict = Field(default_factory=lambda: {"title": "", "image": ""})
    text: Optional[str] = None
    s3_key: Optional[str] = None
    webhook_token: Optional[str] = None
    final_url: Optional[str] = None
    manual_lat: Optional[float] = None
    manual_lng: Optional[float] = None


class DownloadMessage(BaseModel):
    job_id: str
    url: str
    overwrite: bool = False
    webhook_token: Optional[str] = None
