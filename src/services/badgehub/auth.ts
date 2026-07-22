import type Keycloak from 'keycloak-js'
import { useBadgeHubStore } from '../../stores/badgehub'
import { KEYCLOAK_BASE_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID } from './config'

let keycloak: Keycloak | null = null
let initPromise: Promise<Keycloak> | null = null

function syncStore(kc: Keycloak): void {
    useBadgeHubStore.setState({
        authenticated: kc.authenticated === true,
        userId: kc.tokenParsed?.sub ?? null,
        username: (kc.tokenParsed?.preferred_username as string | undefined) ?? null,
    })
}

/** Lazy keycloak init with silent SSO check (no redirect unless login() called). */
export function initAuth(): Promise<Keycloak> {
    if (initPromise) return initPromise
    initPromise = import('keycloak-js').then(({ default: KeycloakClient }) => {
        const kc = new KeycloakClient({
            url: KEYCLOAK_BASE_URL,
            realm: KEYCLOAK_REALM,
            clientId: KEYCLOAK_CLIENT_ID,
        })
        keycloak = kc
        kc.onAuthSuccess = () => syncStore(kc)
        kc.onAuthLogout = () => syncStore(kc)
        kc.onTokenExpired = () => {
            void kc.updateToken(30).catch(() => syncStore(kc))
        }
        return kc
            .init({
                onLoad: 'check-sso',
                silentCheckSsoRedirectUri: `${window.location.origin}${import.meta.env.BASE_URL}silent-check-sso.html`,
                pkceMethod: 'S256',
            })
            .then(() => {
                syncStore(kc)
                return kc
            })
            .catch((err) => {
                console.error('Keycloak init failed', err)
                useBadgeHubStore.setState({ authenticated: false })
                return kc
            })
    })
    return initPromise
}

export async function login(): Promise<void> {
    const kc = await initAuth()
    if (kc.authenticated) return
    await kc.login({ redirectUri: window.location.href })
}

export async function logout(): Promise<void> {
    const kc = await initAuth()
    await kc.logout({ redirectUri: window.location.href })
}

/** Fresh access token, or null when not logged in. */
export async function getToken(): Promise<string | null> {
    const kc = await initAuth()
    if (!kc.authenticated) return null
    try {
        await kc.updateToken(30)
    } catch {
        useBadgeHubStore.setState({ authenticated: false, userId: null, username: null })
        return null
    }
    return kc.token ?? null
}

export function getKeycloak(): Keycloak | null {
    return keycloak
}
