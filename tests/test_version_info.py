import version_info


def test_get_version_strips_bom_from_env(monkeypatch):
    monkeypatch.setenv("RELICLISTMAKER_VERSION", "\ufeff1.2.3")
    version_info.get_version.cache_clear()

    try:
        assert version_info.get_version() == "1.2.3"
    finally:
        version_info.get_version.cache_clear()
        monkeypatch.delenv("RELICLISTMAKER_VERSION", raising=False)
