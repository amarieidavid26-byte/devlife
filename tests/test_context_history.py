"""ContextTracker feeds the ghost's cross-app awareness: ce aplicatii s-au folosit, ce
activitati si cate comutari. Rezumatul ajunge in prompt prin loops.py (`extra_context`),
deci daca get_summary() nu-l returneaza, ghost-ul analizeaza fara niciun context.
"""

from context_history import ContextTracker


def _track(tracker, app, activity):
    tracker.update({"app": app, "activity": activity}, "RELAXED", 0.0)


def test_summary_without_history():
    assert ContextTracker().get_summary() == "No activity yet."


def test_summary_is_returned_when_the_user_is_not_stuck():
    """Regresie: `return summary` statea in ramura de stuck, deci un utilizator care
    lucreaza normal producea None, iar `context_summary or ""` il transforma in prompt
    gol -- tot ce aduna trackerul se pierdea exact in cazul obisnuit."""
    t = ContextTracker()
    _track(t, "editor", "writing code")

    summary = t.get_summary()

    assert summary is not None
    assert "editor" in summary
    assert "writing code" in summary


def test_summary_lists_apps_activities_and_switches():
    t = ContextTracker()
    _track(t, "editor", "writing code")
    _track(t, "browser", "reading docs")

    summary = t.get_summary()

    assert "browser" in summary
    assert "Context switches:" in summary


def test_stuck_line_is_appended_only_while_stuck():
    t = ContextTracker()
    _track(t, "editor", "writing code")

    assert "stuck" not in t.get_summary()

    t.stuck_duration = 42
    stuck_summary = t.get_summary()

    assert "Currently stuck for 42 seconds." in stuck_summary
    assert "editor" in stuck_summary
