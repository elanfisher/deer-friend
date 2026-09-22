using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace DeerFriend;

/// A transparent, click-through strip along the bottom of the screen showing web/index.html in
/// desktop mode — the Windows counterpart of the Mac app's AppDelegate. The page can't see the
/// real cursor through a click-through window, so it's polled here and passed in.
public sealed class DeerWindow : Window
{
    private const double StripHeight = 150;   // logical px: room for jumps, hearts and Z's

    private readonly WebView2 _web = new();
    private readonly Settings _settings;
    private readonly DispatcherTimer _cursorTimer = new() { Interval = TimeSpan.FromMilliseconds(1000.0 / 24) };
    private (int X, int Y, bool Down) _lastCursor = (int.MinValue, int.MinValue, false);
    private bool _pageReady;

    public DeerWindow(Settings settings)
    {
        _settings = settings;

        WindowStyle = WindowStyle.None;
        AllowsTransparency = true;
        Background = Brushes.Transparent;
        ShowInTaskbar = false;
        ResizeMode = ResizeMode.NoResize;
        Topmost = settings.OnTop;

        _web.DefaultBackgroundColor = System.Drawing.Color.Transparent;
        Content = _web;

        SourceInitialized += (_, _) => MakeClickThrough();
        Loaded += async (_, _) => await StartPageAsync();
        _cursorTimer.Tick += (_, _) => PushCursor();
        UpdateBounds();
    }

    // ── placement ──────────────────────────────────────────────────────────────

    /// Bottom of the primary screen's work area (above the taskbar).
    private void UpdateBounds()
    {
        var area = SystemParameters.WorkArea;
        Left = area.Left;
        Top = area.Bottom - StripHeight * _settings.Scale;
        Width = area.Width;
        Height = StripHeight * _settings.Scale;
    }

    public void Reposition() => UpdateBounds();

    /// WS_EX_TRANSPARENT makes clicks (and hover) pass straight through to whatever is behind.
    private void MakeClickThrough()
    {
        var handle = new WindowInteropHelper(this).Handle;
        var style = GetWindowLong(handle, GWL_EXSTYLE);
        SetWindowLong(handle, GWL_EXSTYLE, style | WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE);
    }

    // ── the page ───────────────────────────────────────────────────────────────

    private async System.Threading.Tasks.Task StartPageAsync()
    {
        var userData = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DeerFriend", "WebView2");
        Directory.CreateDirectory(userData);

        var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: userData);
        await _web.EnsureCoreWebView2Async(environment);

        var core = _web.CoreWebView2;
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.AreDevToolsEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsZoomControlEnabled = false;
        core.Settings.AreBrowserAcceleratorKeysEnabled = false;
        // She only ever shows the page that ships with the app.
        core.NewWindowRequested += (_, e) => e.Handled = true;
        core.NavigationStarting += (_, e) =>
        {
            if (!e.Uri.StartsWith("file:///", StringComparison.OrdinalIgnoreCase)) e.Cancel = true;
        };

        await core.AddScriptToExecuteOnDocumentCreatedAsync(BootScript());

        var page = Path.Combine(AppContext.BaseDirectory, "web", "index.html");
        core.Navigate(new Uri(page).AbsoluteUri);

        _pageReady = true;
        _cursorTimer.Start();
        SetHidden(_settings.Hidden);
    }

    /// Settings the page needs before its first frame.
    private string BootScript()
    {
        var opts = JsonSerializer.Serialize(_settings.Flags());
        var scale = _settings.Scale.ToString(System.Globalization.CultureInfo.InvariantCulture);
        return $"window.DEER_DESKTOP = true; window.DEER_SCALE = {scale}; window.DEER_OPTS = {opts};";
    }

    private void Js(string source)
    {
        if (_pageReady && _web.CoreWebView2 != null)
            _ = _web.CoreWebView2.ExecuteScriptAsync($"window.deerDesktop && {source}");
    }

    // ── cursor ─────────────────────────────────────────────────────────────────

    /// Global cursor → strip-local page coordinates (y grows downward). Only sent when it changes.
    private void PushCursor()
    {
        if (_settings.Hidden || !GetCursorPos(out var point)) return;

        var source = PresentationSource.FromVisual(this);
        var scale = source?.CompositionTarget?.TransformFromDevice.M11 ?? 1;   // device px → DIPs
        var x = (int)Math.Round(point.X * scale - Left);
        var y = (int)Math.Round(point.Y * scale - Top);
        var down = (GetAsyncKeyState(VK_LBUTTON) & 0x8000) != 0;

        if ((x, y, down) == _lastCursor) return;
        _lastCursor = (x, y, down);
        Js($"deerDesktop.cursor({x}, {y}, {down.ToString().ToLowerInvariant()})");
    }

    // ── menu actions ───────────────────────────────────────────────────────────

    public void SetOption(string key, bool on)
    {
        Js($"deerDesktop.setOptions({{{key}: {on.ToString().ToLowerInvariant()}}})");
    }

    public void SetScale(double scale)
    {
        Reposition();
        Js($"deerDesktop.setScale({scale.ToString(System.Globalization.CultureInfo.InvariantCulture)})");
    }

    public void SetOnTop(bool on) => Topmost = on;

    public void SetHidden(bool hidden)
    {
        Js($"deerDesktop.setPaused({hidden.ToString().ToLowerInvariant()})");   // stop animating entirely
        if (hidden) Hide(); else Show();
    }

    // ── win32 ──────────────────────────────────────────────────────────────────

    private const int GWL_EXSTYLE = -20;
    private const int WS_EX_LAYERED = 0x80000;
    private const int WS_EX_TRANSPARENT = 0x20;
    private const int WS_EX_TOOLWINDOW = 0x80;
    private const int WS_EX_NOACTIVATE = 0x8000000;
    private const int VK_LBUTTON = 0x01;

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int X; public int Y; }

    [DllImport("user32.dll")] private static extern bool GetCursorPos(out POINT point);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] private static extern IntPtr GetWindowLongPtr(IntPtr window, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] private static extern IntPtr SetWindowLongPtr(IntPtr window, int index, IntPtr value);

    private static int GetWindowLong(IntPtr window, int index) => (int)GetWindowLongPtr(window, index);
    private static void SetWindowLong(IntPtr window, int index, int value) => SetWindowLongPtr(window, index, new IntPtr(value));
}
