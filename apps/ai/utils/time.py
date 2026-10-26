from datetime import datetime, timedelta, timezone
import pytz


def get_time_context(timezone_name: str = "UTC", *, now: datetime | None = None) -> str:
    """Provide a real clock in an IANA timezone; never assume the host's timezone."""
    if not isinstance(timezone_name, str) or not timezone_name or len(timezone_name) > 128:
        raise ValueError("Use a valid IANA timezone")
    if now is not None and now.tzinfo is None:
        raise ValueError("Clock context requires an aware datetime")
    zone = pytz.timezone(timezone_name)
    current = (now or datetime.now(timezone.utc)).astimezone(zone)
    today = current.date()
    return (
        f"\n\nCurrent date and time: {current.isoformat(timespec='seconds')} ({zone.zone}).\n"
        f"Today: {today.isoformat()}. Tomorrow: {(today + timedelta(days=1)).isoformat()}.\n"
        "Resolve relative dates from this clock; do not ask the caller for today's date. "
        "Use get_current_time to refresh the clock or use a caller-requested IANA timezone. "
        "Use the timezone requested by the caller and convert provider results when necessary. "
        "For calendar lookups, 'future' starts now unless the caller specifies another start. "
        "Use the provider's documented date formats and day-boundary semantics."
    )
