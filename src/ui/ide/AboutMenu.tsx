export function AboutMenu() {
    return (
        <div id="menu-about" className="tab-content">
            <a className="github-fork-ribbon left-top" href="https://github.com/DrSkunk/Fri3d-IDE" target="_blank" data-ribbon="Fork me on GitHub" title="Fork me on GitHub">Fork me on GitHub</a>
            <div style={{ textAlign: 'center', padding: '50px 0 0 0' }}>
                <img src="/assets/logo_1024.png" alt="Logo" width="30%" />
                <div style={{ fontSize: '1.5em' }}>Fri3d-IDE</div>
                <div id="viper-ide-version"></div>
                <small><div id="viper-ide-build"></div></small>
                <p>
                    MicroPython Web IDE<br />
                    by <a className="link" href="https://x.com/vshymanskyy" target="_blank">Volodymyr Shymanskyy</a>
                </p>
            </div>
            <div>
                <hr />
                <p id="about-cta">
                    If you like Fri3d-IDE, please <a className="link" id="gh-star">give it a GitHub star</a> ⭐ and spread the word on social media 📢
                </p>
                <p id="report-bug">
                    You can also <a className="link" id="gh-issues">report a bug</a> 🐞
                </p>
                <hr />
            </div>
            <p style={{ textAlign: 'center' }}>
                With 💙💛 from <a className="link" href="https://stand-with-ukraine.pp.ua" target="_blank">Ukraine</a>
            </p>
        </div>
    )
}
