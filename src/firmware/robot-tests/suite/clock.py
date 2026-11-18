"""Carimbos de hora usados nos logs e relatórios."""

import time


def time_of_day() -> str:
    return time.strftime("%H:%M:%S")


def compact_time_of_day() -> str:
    return time.strftime("%H%M%S")


def day_month_time() -> str:
    return time.strftime("%d/%m %H:%M:%S")


def brazilian_date() -> str:
    return time.strftime("%d/%m/%Y")


def iso_date() -> str:
    return time.strftime("%Y-%m-%d")
