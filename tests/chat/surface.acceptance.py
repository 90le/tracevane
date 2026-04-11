from pathlib import Path
from playwright.sync_api import sync_playwright
import json
import re
import time


SCREENSHOT_ENTRY = Path('/tmp/openclaw-studio-chat-entry.png')
SCREENSHOT_SESSION = Path('/tmp/openclaw-studio-chat-session.png')
SCREENSHOT_WORKBENCH = Path('/tmp/openclaw-studio-chat-workbench.png')


def wait_button_enabled(page, locator, timeout=20000):
    locator.wait_for(state='visible', timeout=timeout)
    page.wait_for_function('(el) => !!el && !el.disabled', arg=locator.element_handle(), timeout=timeout)


def click_enabled(page, locator, timeout=20000):
    wait_button_enabled(page, locator, timeout=timeout)
    page.wait_for_timeout(200)
    locator.evaluate('(el) => el.click()')


def create_session(page):
    before_count = page.locator('.chat-shell-session-item').count()
    new_chat = page.locator('.chat-new-chat-trigger').first
    click_enabled(page, new_chat)
    picker = page.locator('.chat-agent-picker')
    picker.wait_for(state='visible', timeout=20000)
    first_agent = picker.locator('.chat-agent-picker-option').first
    with page.expect_response(lambda resp: '/api/chat/agents/' in resp.url and resp.request.method == 'POST', timeout=30000):
        click_enabled(page, first_agent)
    page.wait_for_function(
        "(before) => document.querySelectorAll('.chat-shell-session-item').length >= before + 1",
        arg=before_count,
        timeout=30000,
    )
    page.wait_for_load_state('networkidle')


def create_folder(page, title):
    create_trigger = page.locator('.chat-shell-session-list__header').get_by_role('button', name=re.compile('文件夹|Folder')).first
    click_enabled(page, create_trigger)
    create_form = page.locator('.chat-shell-folder-create-form')
    create_form.wait_for(state='visible', timeout=15000)
    create_input = create_form.locator('input').first
    create_input.fill(title)
    click_enabled(page, create_form.get_by_role('button', name=re.compile('创建|Create')).first)
    page.wait_for_function(
        "(title) => Array.from(document.querySelectorAll('.chat-shell-folder-row strong')).some((el) => (el.textContent || '').includes(title))",
        arg=title,
        timeout=30000,
    )


def folder_row(page, title):
    return page.locator('.chat-shell-folder-row').filter(has_text=title).first


def session_row(page, title):
    return page.locator('.chat-shell-session-row').filter(has_text=title).first


def open_menu_from_row(page, row):
    row.click(button='right')
    menu = page.locator('.cascade-menu').first
    menu.wait_for(state='visible', timeout=10000)
    return menu


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1600, 'height': 1400})

    result = {}

    page.goto('http://127.0.0.1:5176/chat', wait_until='domcontentloaded')
    page.wait_for_load_state('networkidle')

    entry_text = page.locator('body').inner_text()
    entry_ok = page.locator('.chat-shell-session-list').count() > 0 and page.locator('.chat-conversation-pane').count() > 0
    workbench_absent = ('Session Workbench' not in entry_text) and ('会话工作台' not in entry_text)
    picker_absent = page.locator('.chat-agent-picker').count() == 0
    page.screenshot(path=str(SCREENSHOT_ENTRY), full_page=True)

    suffix = str(int(time.time() * 1000))[-6:]
    folder_title = f'Dir Smoke Alpha {suffix}'
    renamed_folder_title = f'Dir Smoke Renamed {suffix}'
    create_folder(page, folder_title)
    created_folder_row = folder_row(page, folder_title)
    result['folder_created'] = created_folder_row.count() == 1

    create_session(page)
    page.wait_for_function("() => document.querySelectorAll('.chat-shell-session-row').length > 0", timeout=30000)
    active_row = page.locator('.chat-shell-session-row.active').first
    session_title_before = active_row.locator('strong').first.inner_text()
    result['session_created_for_directory_smoke'] = bool(session_title_before)

    search_input = page.locator('.chat-shell-session-search input').first
    search_input.fill(folder_title)
    page.wait_for_timeout(300)
    result['search_filters_directory'] = created_folder_row.is_visible()
    search_input.fill('')
    page.wait_for_timeout(300)

    filter_button = page.locator('.chat-shell-session-filter-button').first
    click_enabled(page, filter_button)
    filter_popover = page.locator('.chat-shell-session-filter-popover')
    filter_popover.wait_for(state='visible', timeout=10000)
    options = filter_popover.locator('option')
    if options.count() > 1:
      selected_value = options.nth(1).get_attribute('value')
      filter_popover.locator('select').select_option(selected_value)
      page.wait_for_timeout(300)
      result['filter_chip_visible'] = page.locator('.chat-shell-session-filter-chip').count() > 0
      click_enabled(page, page.get_by_role('button', name=re.compile('清空全部|Clear all')).first)
      page.wait_for_timeout(300)
      result['filter_clear_all'] = page.locator('.chat-shell-session-filter-chip').count() == 0
    else:
      result['filter_chip_visible'] = False
      result['filter_clear_all'] = True

    created_folder_row = folder_row(page, folder_title)
    folder_menu_btn = created_folder_row.locator('.chat-shell-session-more').first
    click_enabled(page, folder_menu_btn)
    rename_folder_item = page.locator('.cascade-menu button').filter(has_text=re.compile('重命名|Rename')).first
    click_enabled(page, rename_folder_item)
    rename_folder_input = page.locator('.chat-shell-folder-row.renaming input').first
    rename_folder_input.fill(renamed_folder_title)
    click_enabled(page, page.locator('.chat-shell-folder-row.renaming').get_by_role('button', name=re.compile('保存|Save')).first)
    page.wait_for_function(
        "(title) => Array.from(document.querySelectorAll('.chat-shell-folder-row strong')).some((el) => (el.textContent || '').includes(title))",
        arg=renamed_folder_title,
        timeout=30000,
    )
    renamed_folder_row = folder_row(page, renamed_folder_title)
    result['folder_rename_flow'] = renamed_folder_row.count() == 1

    active_row = page.locator('.chat-shell-session-row.active').first
    session_context_menu = open_menu_from_row(page, active_row)
    move_item = session_context_menu.locator('button').filter(has_text=re.compile('移动到文件夹|Move to folder')).first
    move_item.hover()
    page.wait_for_function(
        "(title) => Array.from(document.querySelectorAll('.cascade-menu button')).some((el) => (el.textContent || '').includes(title))",
        arg=renamed_folder_title,
        timeout=10000,
    )
    move_target = page.locator('.cascade-menu button').filter(has_text=renamed_folder_title).last
    click_enabled(page, move_target)
    page.wait_for_timeout(400)
    result['move_to_folder_submenu_visible'] = True

    click_enabled(page, renamed_folder_row.locator('.chat-shell-folder-item').first)
    page.wait_for_timeout(500)
    folder_heading = page.locator('.chat-shell-session-subheader h3').first
    result['folder_view_opened'] = folder_heading.count() > 0 and renamed_folder_title in folder_heading.inner_text()
    result['folder_contains_session'] = page.locator('.chat-shell-session-row').count() >= 1

    folder_session_row = page.locator('.chat-shell-session-row').first
    folder_session_menu = open_menu_from_row(page, folder_session_row)
    archive_item = folder_session_menu.locator('button').filter(has_text=re.compile('归档|Archive')).first
    click_enabled(page, archive_item)
    page.wait_for_timeout(600)

    select_toggle = page.locator('.chat-shell-session-list__header').get_by_role('button', name=re.compile('选择|Select|完成|Done')).first
    back_to_root = page.get_by_role('button', name=re.compile('返回根目录|Back to root')).first
    click_enabled(page, back_to_root)
    archived_row = folder_row(page, 'Archived')
    click_enabled(page, archived_row.locator('.chat-shell-folder-item').first)
    page.wait_for_timeout(500)
    archive_heading = page.locator('.chat-shell-session-subheader h3').first
    result['archive_view_opened'] = archive_heading.count() > 0 and archive_heading.inner_text() in ('Archived', '已归档')
    result['archived_session_visible'] = page.locator('.chat-shell-session-row').count() >= 1

    click_enabled(page, select_toggle)
    batch_bar = page.locator('.chat-shell-session-batchbar')
    batch_bar.wait_for(state='visible', timeout=10000)
    click_enabled(page, batch_bar.get_by_role('button', name=re.compile('全选|反选|Select all|Invert')).first)
    page.wait_for_timeout(300)
    result['selection_mode_visible'] = page.locator('.chat-shell-session-batchbar').count() == 1
    click_enabled(page, select_toggle)
    page.wait_for_timeout(300)

    archived_session_row = page.locator('.chat-shell-session-row').first
    archived_menu = open_menu_from_row(page, archived_session_row)
    rename_session_item = archived_menu.locator('button').filter(has_text=re.compile('重命名|Rename')).first
    click_enabled(page, rename_session_item)
    renamed_session_title = f'Dir Smoke Session Renamed {suffix}'
    rename_session_input = page.locator('.chat-shell-session-row.renaming input').first
    rename_session_input.fill(renamed_session_title)
    click_enabled(page, page.locator('.chat-shell-session-row.renaming').get_by_role('button', name=re.compile('保存|Save')).first)
    page.wait_for_function(
        "(title) => Array.from(document.querySelectorAll('.chat-shell-session-row strong')).some((el) => (el.textContent || '').includes(title))",
        arg=renamed_session_title,
        timeout=30000,
    )
    result['session_rename_flow'] = session_row(page, renamed_session_title).count() == 1

    page.screenshot(path=str(SCREENSHOT_SESSION), full_page=True)

    session_url = page.url
    session_text = page.locator('body').inner_text()
    is_session_route = '/chat/workbench' not in session_url and '/chat' in session_url
    diagnostics_absent = ('Diagnostics' not in session_text) and ('Gateway URL' not in session_text) and ('same-origin' not in session_text)

    page.goto('http://127.0.0.1:5176/chat/workbench', wait_until='domcontentloaded')
    page.wait_for_load_state('networkidle')
    workbench_text = page.locator('body').inner_text()
    workbench_ok = page.locator('.chat-inspector-panel').count() > 0
    diagnostics_present = ('Diagnostics' in workbench_text) or ('DIAGNOSTICS' in workbench_text)
    page.screenshot(path=str(SCREENSHOT_WORKBENCH), full_page=True)

    result.update({
        'entry_ok': entry_ok,
        'workbench_absent_on_entry': workbench_absent,
        'picker_absent_on_entry': picker_absent,
        'session_route_ok': is_session_route,
        'diagnostics_absent_on_private_page': diagnostics_absent,
        'workbench_ok': workbench_ok,
        'diagnostics_present_on_workbench': diagnostics_present,
        'entry_screenshot': str(SCREENSHOT_ENTRY),
        'session_screenshot': str(SCREENSHOT_SESSION),
        'workbench_screenshot': str(SCREENSHOT_WORKBENCH),
    })
    critical_checks = [
        'folder_created',
        'search_filters_directory',
        'filter_chip_visible',
        'filter_clear_all',
        'folder_rename_flow',
        'move_to_folder_submenu_visible',
        'folder_view_opened',
        'folder_contains_session',
        'selection_mode_visible',
        'archive_view_opened',
        'archived_session_visible',
        'session_rename_flow',
        'entry_ok',
        'workbench_absent_on_entry',
        'picker_absent_on_entry',
        'session_route_ok',
        'diagnostics_absent_on_private_page',
        'workbench_ok',
        'diagnostics_present_on_workbench',
    ]
    failed = [key for key in critical_checks if not result.get(key)]
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if failed:
        raise SystemExit(f'directory smoke failed: {", ".join(failed)}')
    browser.close()
