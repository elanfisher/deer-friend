using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;

namespace DeerFriend;

/// The toggles shared with the page (web/deer.js reads them as OPT.&lt;name&gt;), plus where she
/// lives and how big she is. Saved next to the user's other app data.
public sealed class Settings
{
    public double Scale { get; set; } = 1;
    public bool Friend { get; set; }
    public bool Ignore { get; set; }
    public bool Watch { get; set; } = true;
    public bool Follow { get; set; }
    public bool Shy { get; set; }
    public bool OnTop { get; set; }
    public bool Hidden { get; set; }

    private static string Path => System.IO.Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "DeerFriend", "settings.json");

    public static Settings Load()
    {
        try
        {
            if (File.Exists(Path))
                return JsonSerializer.Deserialize<Settings>(File.ReadAllText(Path)) ?? new Settings();
        }
        catch (Exception)
        {
            // a corrupt settings file shouldn't stop her appearing
        }
        return new Settings();
    }

    public void Save()
    {
        try
        {
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(Path)!);
            File.WriteAllText(Path, JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch (Exception)
        {
            // not worth bothering the user about
        }
    }

    /// The option flags, in the shape web/deer.js expects.
    public IReadOnlyDictionary<string, bool> Flags() => new Dictionary<string, bool>
    {
        ["friend"] = Friend,
        ["ignore"] = Ignore,
        ["watch"] = Watch,
        ["follow"] = Follow,
        ["shy"] = Shy,
    };
}
