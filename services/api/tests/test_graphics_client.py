from app.graphics.client import should_generate_drawing


def test_graphics_subject_with_drawing_intent_routes_to_renderer() -> None:
    assert should_generate_drawing(
        "Engineering Graphics",
        "MEG101",
        "Draw the projections of a square prism inclined at 45 degrees to HP.",
    )


def test_non_graphics_subject_never_routes_to_renderer() -> None:
    assert not should_generate_drawing(
        "Data Structures and Algorithms",
        "PCCST303",
        "Draw a stack diagram.",
    )


def test_graphics_theory_question_stays_text_only() -> None:
    assert not should_generate_drawing(
        "Engineering Graphics",
        "EGD101",
        "Explain why engineering graphics is important.",
    )
