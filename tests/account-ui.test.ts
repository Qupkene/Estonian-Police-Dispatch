// @vitest-environment jsdom
// Account UI: the Klassika login keeps focus and announces errors, the delete dialog keeps focus in the
// modal, the privacy notes match what is sent, and "Delete all data" really signs out.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';

type Handler = (method: string, path: string, body: Record<string, unknown>) => { status: number; body: unknown } | null;

const net = vi.hoisted(() => {
  const state = {
    calls: [] as { method: string; path: string }[],
    handler: null as Handler | null,
  };
  // Installed before the modules load: src/net/account.ts probes the backend on import.
  globalThis.fetch = (async (input: unknown, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://epd.test');
    const method = init.method ?? 'GET';
    state.calls.push({ method, path: url.pathname });
    const body = typeof init.body === 'string' && init.body ? JSON.parse(init.body) : {};
    const custom = state.handler?.(method, url.pathname, body);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
    if (custom) return json(custom.body, custom.status);
    if (url.pathname === '/api/health') return json({ ok: true, version: 'test', accounts: true });
    if (url.pathname === '/api/me') return json({ user: null });
    if (url.pathname === '/api/logout') return json({ ok: true });
    return json({ error: 'not_found', message: 'Sellist aadressi ei ole.' }, 404);
  }) as typeof fetch;
  return state;
});

import { useAccount } from '@/net/account';
import { useSettings } from '@/store/settings';
import { LoginScreen } from '@/ui/screens/LoginScreen';
import { SettingsScreen } from '@/ui/screens/SettingsScreen';
import { AccountChip } from '@/ui/screens/shell/AccountChip';

const T = {
  idSim: 'Simulatsioon: päris ID-kaarti, Mobiil-ID-d ega Smart-ID-d ei kasutata ja andmeid ei saadeta kuhugi.',
  accountSim:
    'Simulatsioon: päris ID-kaarti, Mobiil-ID-d ega Smart-ID-d ei kasutata. Konto salvestab nime, parooli räsi ja mänguseisu politsei.eu serverisse.',
};

beforeEach(async () => {
  net.calls.length = 0;
  net.handler = null;
  useSettings.getState().set({ lang: 'et' });
  await useAccount.getState().init();
});

afterEach(() => {
  cleanup();
  useAccount.setState({ user: null, error: null, busy: false });
});

async function openClassic() {
  render(createElement(LoginScreen));
  fireEvent.click(screen.getByRole('tab', { name: /Klassika/ }));
  await screen.findByRole('button', { name: 'Pole veel kontot? Loo konto' });
}

describe('Klassika login', () => {
  it('keeps focus in the password field after a wrong password, and points it at the announced error', async () => {
    net.handler = (_method, path) =>
      path === '/api/login' ? { status: 401, body: { error: 'bad_login', message: 'Vale kasutajanimi või parool.' } } : null;
    await openClassic();
    const user = screen.getByLabelText('Kasutajanimi') as HTMLInputElement;
    const pass = screen.getByLabelText('Parool', { selector: 'input' }) as HTMLInputElement;
    fireEvent.change(user, { target: { value: 'mari' } });
    fireEvent.change(pass, { target: { value: 'vale-parool' } });
    pass.focus();
    fireEvent.submit(pass.form as HTMLFormElement);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Vale kasutajanimi või parool.');
    // Same input element (not remounted) and still focused: the phone keyboard stays open.
    expect(screen.getByLabelText('Parool', { selector: 'input' })).toBe(pass);
    expect(document.activeElement).toBe(pass);
    expect(pass.getAttribute('aria-invalid')).toBe('true');
    expect(pass.getAttribute('aria-describedby')).toBe(alert.id);
  });

  it('a name rule error focuses the name field and names the allowed letters', async () => {
    await openClassic();
    fireEvent.click(screen.getByRole('button', { name: 'Pole veel kontot? Loo konto' }));
    const user = screen.getByLabelText('Kasutajanimi') as HTMLInputElement;
    fireEvent.change(user, { target: { value: 'Андрей' } });
    fireEvent.change(screen.getByLabelText('Parool', { selector: 'input' }), { target: { value: 'salajane-123' } });
    fireEvent.change(screen.getByLabelText('Korda parooli'), { target: { value: 'salajane-123' } });
    const submit = document.querySelector('form.sh-legacy button[type="submit"]') as HTMLButtonElement;
    submit.focus();
    fireEvent.submit(user.form as HTMLFormElement);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Nimes võivad olla ainult ladina tähed (ka õ, ä, ö, ü, š, ž), numbrid ja märgid _ . -');
    expect(document.activeElement).toBe(user);
    expect(net.calls.some((c) => c.path === '/api/register')).toBe(false);
  });

  it('the 2024 easter egg (both fields empty) still logs in without any request', async () => {
    await openClassic();
    net.calls.length = 0;
    const user = screen.getByLabelText('Kasutajanimi') as HTMLInputElement;
    fireEvent.submit(user.form as HTMLFormElement);
    expect(await screen.findByText('Tere tagasi, 2024!')).toBeTruthy();
    expect(net.calls.filter((c) => c.path !== '/api/health')).toEqual([]);
  });

  it('says what an account stores under the account form, and keeps the e-ID note elsewhere', async () => {
    render(createElement(LoginScreen));
    expect(screen.getByText(T.idSim)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Klassika/ }));
    expect(await screen.findByText(T.accountSim)).toBeTruthy();
    expect(screen.queryByText(T.idSim)).toBeNull();
  });
});

describe('account deletion dialog', () => {
  it('a wrong password keeps focus in the dialog and the error is announced', async () => {
    net.handler = (method, path) =>
      method === 'DELETE' && path === '/api/me' ? { status: 403, body: { error: 'wrong_password', message: 'Vale parool.', field: 'password' } } : null;
    useAccount.setState({ user: { id: 7, name: 'Mari', created: 1 } });
    render(createElement(AccountChip));
    fireEvent.click(document.querySelector('.sh-acct__btn') as HTMLElement);
    fireEvent.click(screen.getByRole('menuitem', { name: /Kustuta konto/ }));
    const input = (await screen.findByLabelText('Kinnita parooliga')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'vale-parool-1' } });
    const confirm = screen.getByRole('button', { name: /Kustuta jäädavalt/ });
    confirm.focus();
    await act(async () => {
      fireEvent.click(confirm);
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Vale parool.');
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute('aria-describedby')).toBe(alert.id);
  });
});

describe('settings: data', () => {
  it('tells account players that the cloud copy stays and that deleting signs them out', async () => {
    useAccount.setState({ user: { id: 7, name: 'Mari', created: 1 } });
    render(createElement(SettingsScreen));
    expect(screen.getByText(/Sinu konto andmed on ka politsei\.eu serveris/)).toBeTruthy();
    expect(screen.queryByText('Kõik andmed hoitakse ainult selles brauseris.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Kustuta$/ }));
    expect(await screen.findByText('Sind logitakse välja. Konto ja selle pilvesalvestused jäävad serverisse alles.')).toBeTruthy();
  });

  it('guests keep the browser-only note', () => {
    render(createElement(SettingsScreen));
    expect(screen.getByText('Kõik andmed hoitakse ainult selles brauseris.')).toBeTruthy();
  });

  it('"Delete all data" ends the server session before clearing the browser', async () => {
    localStorage.setItem('epd:career', '{"state":{"profile":null,"inbox":[]},"version":1}');
    render(createElement(SettingsScreen));
    fireEvent.click(screen.getByRole('button', { name: /^Kustuta$/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Kinnita/ }));
    await waitFor(() => expect(net.calls.some((c) => c.method === 'POST' && c.path === '/api/logout')).toBe(true));
    await waitFor(() => expect(localStorage.getItem('epd:career')).toBeNull());
  });
});
