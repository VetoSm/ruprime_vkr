from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime


class RegisterRequest(BaseModel):
    login: str
    email: EmailStr
    password: str
    confirm_password: str
    role: str = "PLAYER"

    @field_validator("login")
    @classmethod
    def login_no_spaces(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Login cannot be empty")
        if len(v) < 3:
            raise ValueError("Login must be at least 3 characters")
        return v

    @field_validator("password")
    @classmethod
    def password_valid(cls, v: str) -> str:
        if " " in v:
            raise ValueError("Password must not contain spaces")
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

    @field_validator("email")
    @classmethod
    def email_strip(cls, v: str) -> str:
        return v.strip()


class RegisterResponse(BaseModel):
    id: int
    email: str
    login: str
    role: str
    is_active: bool
    is_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    id: int
    email: str
    login: str
    role: str
    is_active: bool
    is_verified: bool

    class Config:
        from_attributes = True


class LogoutRequest(BaseModel):
    refresh_token: str


class LinkSteamRequest(BaseModel):
    steam_token: str


class LinkSteamResponse(BaseModel):
    provider: str
    provider_user_id: str
    linked: bool


class MessageResponse(BaseModel):
    message: str
