"""Errors the API turns into JSON responses."""


class ApiError(Exception):
    status = 400

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.message = message
        if status is not None:
            self.status = status


class Forbidden(ApiError):
    status = 403

    def __init__(self, message: str = "You are not allowed to do that."):
        super().__init__(message)


class NotFound(ApiError):
    status = 404

    def __init__(self, message: str = "Not found."):
        super().__init__(message)
