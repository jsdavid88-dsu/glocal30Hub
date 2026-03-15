import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, computed_field

from app.models.attendance import AttendanceType


class AttendanceResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str | None = None
    date: date
    check_in: datetime | None = None
    check_out: datetime | None = None
    type: AttendanceType
    created_at: datetime
    updated_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def status(self) -> str:
        if self.check_in is None:
            return "결근"
        if self.check_out is None:
            return "근무중"
        # 지각: check_in after 09:30 KST
        check_in_hour = self.check_in.hour
        check_in_minute = self.check_in.minute
        if check_in_hour > 9 or (check_in_hour == 9 and check_in_minute > 30):
            return "지각"
        return "정상"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def hours(self) -> float | None:
        if self.check_in and self.check_out:
            delta = self.check_out - self.check_in
            return round(delta.total_seconds() / 3600, 1)
        return None

    model_config = {"from_attributes": True}


class AttendanceCheckIn(BaseModel):
    type: AttendanceType = AttendanceType.daily


class AttendanceHistoryParams(BaseModel):
    user_id: uuid.UUID | None = None
    start_date: date | None = None
    end_date: date | None = None
    type: AttendanceType | None = None
    page: int = Field(1, ge=1)
    limit: int = Field(20, ge=1, le=100)


class MonthlyStatsResponse(BaseModel):
    total_days: int = 0
    avg_hours: float = 0.0
    late_days: int = 0
    early_leaves: int = 0
    absent_days: int = 0


class StudentAttendanceResponse(BaseModel):
    user_id: uuid.UUID
    user_name: str
    attendance: AttendanceResponse | None = None
