using System;
using System.Drawing;
using System.IO;
using System.Windows;
using Microsoft.Win32;
using Forms = System.Windows.Forms;

namespace DeerFriend;

/// Entry point: shows the fawn and puts her icon in the notification area. There is no taskbar
/// button and no main window — the tray menu is the whole interface, like the Mac menu bar item.
public static class Program
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string RunValue = "DeerFriend";

    private static Settings _settings = null!;
    private static DeerWindow _window = null!;
    private static Forms.NotifyIcon _tray = null!;

    [STAThread]
    public static void Main()
    {
        _settings = Settings.Load();

        var app = new Application { ShutdownMode = ShutdownMode.OnExplicitShutdown };
        _window = new DeerWindow(_settings);
        _window.Show();

        _tray = new Forms.NotifyIcon
        {
            Icon = LoadIcon(),
            Text = "Deer Friend",
            Visible = true,
            ContextMenuStrip = BuildMenu(),
        };
        _tray.MouseUp += (_, e) => { if (e.Button == Forms.MouseButtons.Left) _tray.ContextMenuStrip!.Show(Forms.Cursor.Position); };
        SystemEvents.DisplaySettingsChanged += (_, _) => _window.Reposition();

        app.Run();
        _tray.Visible = false;
    }

    private static Icon LoadIcon()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "deer.ico");
        return File.Exists(path) ? new Icon(path) : SystemIcons.Application;
    }

    /// Rebuilt every time it opens, so the ticks are always current.
    private static Forms.ContextMenuStrip BuildMenu()
    {
        var menu = new Forms.ContextMenuStrip();
        menu.Opening += (_, _) =>
        {
            menu.Items.Clear();
            menu.Items.Add(new Forms.ToolStripLabel("Deer Friend") { Enabled = false });
            menu.Items.Add(new Forms.ToolStripSeparator());

            Add(menu, _settings.Hidden ? "Show Deer" : "Hide Deer", () =>
            {
                _settings.Hidden = !_settings.Hidden;
                _window.SetHidden(_settings.Hidden);
            });
            Toggle(menu, "Friend Mode", _settings.Friend, on => { _settings.Friend = on; _window.SetOption("friend", on); });
            menu.Items.Add(new Forms.ToolStripSeparator());

            Toggle(menu, "Auto Mode (Ignore Cursor)", _settings.Ignore, on => { _settings.Ignore = on; _window.SetOption("ignore", on); });
            Toggle(menu, "Watch the Cursor", _settings.Watch, on => { _settings.Watch = on; _window.SetOption("watch", on); }, !_settings.Ignore);
            Toggle(menu, "Follow the Cursor", _settings.Follow, on => { _settings.Follow = on; _window.SetOption("follow", on); }, !_settings.Ignore);
            Toggle(menu, "Move Out of the Way When Hovered", _settings.Shy, on => { _settings.Shy = on; _window.SetOption("shy", on); }, !_settings.Ignore);
            menu.Items.Add(new Forms.ToolStripSeparator());

            Toggle(menu, "Show in Front of Windows", _settings.OnTop, on => { _settings.OnTop = on; _window.SetOnTop(on); });

            var size = new Forms.ToolStripMenuItem("Size");
            foreach (var (name, value) in new[] { ("Small", 1.0), ("Medium", 1.5), ("Large", 2.0) })
            {
                var item = new Forms.ToolStripMenuItem(name) { Checked = Math.Abs(_settings.Scale - value) < 0.01 };
                item.Click += (_, _) => { _settings.Scale = value; _window.SetScale(value); _settings.Save(); };
                size.DropDownItems.Add(item);
            }
            menu.Items.Add(size);
            menu.Items.Add(new Forms.ToolStripSeparator());

            Toggle(menu, "Start with Windows", StartsWithWindows(), SetStartsWithWindows);
            Add(menu, "Quit Deer Friend", () => { _settings.Save(); Application.Current.Shutdown(); });
        };
        return menu;
    }

    private static void Add(Forms.ContextMenuStrip menu, string text, Action action)
    {
        var item = new Forms.ToolStripMenuItem(text);
        item.Click += (_, _) => action();
        menu.Items.Add(item);
    }

    private static void Toggle(Forms.ContextMenuStrip menu, string text, bool on, Action<bool> set, bool enabled = true)
    {
        var item = new Forms.ToolStripMenuItem(text) { Checked = on, Enabled = enabled };
        item.Click += (_, _) => { set(!on); _settings.Save(); };
        menu.Items.Add(item);
    }

    // ── start with Windows (per-user Run key; no admin rights needed) ──

    private static bool StartsWithWindows()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKey);
        return key?.GetValue(RunValue) != null;
    }

    private static void SetStartsWithWindows(bool on)
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKey, writable: true);
        if (key == null) return;
        if (on) key.SetValue(RunValue, $"\"{Environment.ProcessPath}\"");
        else key.DeleteValue(RunValue, throwOnMissingValue: false);
    }
}
