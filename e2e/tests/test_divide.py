import pytest

from calc import divide


def test_divide_by_zero_raises_value_error():
    with pytest.raises(ValueError):
        divide(1, 0)
