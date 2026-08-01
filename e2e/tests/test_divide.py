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


def test_divide_returns_arithmetic_quotient():
    # 7 / 2 == 3.5 distinguishes true division from a * b (14), b / a
    # (0.2857...), and a // b (3), all of which pass the assertion-free
    # test_divide_runs above.
    assert divide(7, 2) == 3.5
