import pytest

from calc import divide


def test_divide_by_zero_raises_value_error():
    with pytest.raises(ValueError):
        divide(1, 0)


def test_divide_runs():
    # PLANTED for Task 10: executes the happy path and asserts nothing about
    # the result. Coverage will call `return a / b` covered; no test would
    # notice if it returned a * b instead.
    divide(10, 2)
