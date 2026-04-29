from pydantic import BaseModel, Field


class AttendeeProfile(BaseModel):
    attendee_id: str
    name: str
    headline: str
    bio: str
    company: str
    role: str
    skills: list[str] = Field(default_factory=list)
    looking_for: str


class ScoreRequest(BaseModel):
    requester: AttendeeProfile
    candidate: AttendeeProfile
    intent: str = Field(
        ...,
        description="What the requester is looking for (free-form natural language).",
    )


class ScoreResponse(BaseModel):
    score: int = Field(..., ge=0, le=100)
    rationale: str = Field(..., max_length=200)
    shared_ground: list[str]
