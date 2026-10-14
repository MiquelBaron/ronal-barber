from unittest.mock import MagicMock, patch

import pytest

from app.services import telegram_logs
from app.services.settings_store import RuntimeSettings, clear_runtime_settings_cache
from app.services.telegram_logs import TelegramErrorLogHandler, format_error_record


@pytest.fixture(autouse=True)
def _reset_handler_throttle() -> None:
    TelegramErrorLogHandler._last_sent_at = 0.0
    TelegramErrorLogHandler._suppressed = 0
    clear_runtime_settings_cache()
    yield
    clear_runtime_settings_cache()


def test_format_error_record_escapes_html() -> None:
    record = MagicMock()
    record.name = "app.services.email"
    record.levelname = "ERROR"
    record.getMessage.return_value = "boom <script>"
    record.exc_info = None
    record.exc_text = None

    text = format_error_record(record)
    assert "&lt;script&gt;" in text
    assert "<script>" not in text


@patch("app.services.telegram_logs._send_log_message_sync", return_value=True)
@patch(
    "app.services.telegram_logs.get_runtime_settings",
    return_value=RuntimeSettings(
        telegram_logs_bot_token="123:ABC",
        telegram_logs_chat_id="999",
    ),
)
def test_handler_sends_on_error(mock_settings: MagicMock, mock_send: MagicMock) -> None:
    handler = TelegramErrorLogHandler()
    record = MagicMock()
    record.levelno = 40  # ERROR
    record.name = "app.services.email"
    record.levelname = "ERROR"
    record.getMessage.return_value = "SMTP failed"
    record.exc_info = None
    record.exc_text = None

    handler.emit(record)

    mock_send.assert_called_once()
    assert "SMTP failed" in mock_send.call_args.args[0]


@patch("app.services.telegram_logs._send_log_message_sync", return_value=True)
@patch(
    "app.services.telegram_logs.get_runtime_settings",
    return_value=RuntimeSettings(telegram_logs_bot_token="", telegram_logs_chat_id=""),
)
def test_handler_skips_when_disabled(mock_settings: MagicMock, mock_send: MagicMock) -> None:
    handler = TelegramErrorLogHandler()
    record = MagicMock()
    record.levelno = 40
    record.name = "app.main"

    handler.emit(record)

    mock_send.assert_not_called()


@patch("app.services.telegram_logs._send_log_message_sync", return_value=True)
@patch(
    "app.services.telegram_logs.get_runtime_settings",
    return_value=RuntimeSettings(
        telegram_logs_bot_token="123:ABC",
        telegram_logs_chat_id="999",
    ),
)
def test_handler_skips_own_logger(mock_settings: MagicMock, mock_send: MagicMock) -> None:
    handler = TelegramErrorLogHandler()
    record = MagicMock()
    record.levelno = 40
    record.name = "app.services.telegram_logs"

    handler.emit(record)

    mock_send.assert_not_called()


def test_configure_telegram_error_logging_is_idempotent() -> None:
    import logging

    root = logging.getLogger()
    before = sum(1 for h in root.handlers if isinstance(h, TelegramErrorLogHandler))
    telegram_logs.configure_telegram_error_logging()
    telegram_logs.configure_telegram_error_logging()
    after = sum(1 for h in root.handlers if isinstance(h, TelegramErrorLogHandler))
    assert after == max(before, 1)
    assert after == before or after == 1
