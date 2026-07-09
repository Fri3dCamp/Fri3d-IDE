// All controls are uncontrolled on purpose: src/app.js restores persisted
// values and binds change listeners after the shell mounts.
export function SettingsMenu() {
    return (
        <div id="menu-settings" className="tab-content">
            <div id="menu-settings-title">Settings</div>
            <div id="menu-settings-list">
                <div><input type="checkbox" id="advanced-mode" /><label htmlFor="advanced-mode">🔬 Advanced mode</label> (<a href="https://github.com/DrSkunk/Fri3d-IDE/blob/main/docs/Advanced-Mode.md" target="_blank">?</a>)</div>
                <div className="title-lines" id="menu-line-conn">connection</div>
                <div><input type="checkbox" id="interrupt-device" defaultChecked /><label htmlFor="interrupt-device">Interrupt device</label></div>
                <div><input type="checkbox" id="force-serial-poly" /><label htmlFor="force-serial-poly">Force WebSerial polyfill</label></div>
                <div className="title-lines" id="menu-line-editor">editor</div>
                <div><input type="checkbox" id="expand-minify-json" defaultChecked /><label htmlFor="expand-minify-json">Auto expand/minify JSON</label></div>
                <div><input type="checkbox" id="use-word-wrap" /><label htmlFor="use-word-wrap">Word wrapping</label></div>
                <div><input type="checkbox" id="render-markdown" defaultChecked /><label htmlFor="render-markdown">Enable Markdown viewer</label></div>
                <div className="title-lines" id="menu-line-pkg-mgr">package manager</div>
                <div><input type="checkbox" id="install-package-source" /><label htmlFor="install-package-source">Prefer installing sources (.py)</label></div>
                <div className="title-lines" id="menu-line-other">other</div>
                <div className="space-between">
                    <label htmlFor="lang">Language:</label>
                    <select id="lang" defaultValue="en">
                        {/* Indo-European Languages */}
                        <option value="en">🇺🇸 USA, 🇬🇧 British</option>
                        <option value="es">🇪🇸 Español</option>
                        <option value="hi">🇮🇳 हिंदी</option>
                        <option value="fr">🇫🇷 Français</option>
                        <option value="pt">🇵🇹 Português</option>
                        <option value="de">🇩🇪 Deutsch</option>
                        <option value="pl">🇵🇱 Polski</option>
                        <option value="it">🇮🇹 Italiano</option>
                        <option value="uk">🇺🇦 Українська</option>
                        <option value="ro">🇷🇴 Română</option>
                        <option value="nl">🇳🇱 Nederlands</option>
                        <option value="sv">🇸🇪 Svenska</option>
                        <option value="el">🇬🇷 Ελληνικά</option>
                        <option value="ru">🇷🇺🪖🚢🏃🖕</option>

                        {/* Sino-Tibetan Languages */}
                        <option value="zh-CN">🇨🇳 简体中文</option>
                        <option value="zh-TW">🇹🇼 繁體中文</option>

                        {/* Afro-Asiatic Languages */}
                        <option value="ar">🇸🇦 العربية</option>
                        <option value="he">🇮🇱 עברית</option>

                        {/* Altaic Languages */}
                        <option value="ja">🇯🇵 日本語</option>
                        <option value="ko">🇰🇷 한국어</option>

                        {/* Austronesian Languages */}
                        <option value="id">🇮🇩 Bahasa Indonesia</option>
                    </select>
                </div>
                <div className="space-between">
                    <label htmlFor="zoom">Zoom:</label>
                    <select id="zoom" defaultValue="1.00">
                        <option value="0.80">80%</option>
                        <option value="1.00">100%</option>
                        <option value="1.10">110%</option>
                        <option value="1.25">125%</option>
                        <option value="1.50">150%</option>
                    </select>
                </div>
                <div className="space-between">
                    <label htmlFor="color-theme">Theme:</label>
                    <select id="color-theme" defaultValue="system">
                        <option value="system">System</option>
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                    </select>
                </div>
                <div><input type="checkbox" id="use-natural-sort" defaultChecked /><label htmlFor="use-natural-sort">Use natural sorting</label></div>
            </div>
        </div>
    )
}
