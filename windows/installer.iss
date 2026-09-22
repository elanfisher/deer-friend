; Inno Setup script for the Windows installer (DeerFriendSetup.exe).
; Built in CI after `dotnet publish`; see .github/workflows/release.yml.
#define AppName "Deer Friend"
#define AppVersion "1.0.0"
#define AppExe "DeerFriend.exe"

[Setup]
AppId={{9C3B5E38-1C2E-4C9E-9A4B-7B1D4E4F1A21}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=elanfisher
AppSupportURL=https://github.com/elanfisher/deer-friend
DefaultDirName={autopf}\Deer Friend
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=DeerFriendSetup
SetupIconFile=deer.ico
UninstallDisplayIcon={app}\{#AppExe}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Tasks]
Name: "startup"; Description: "Start {#AppName} when I sign in"; GroupDescription: "Options:"

[Files]
Source: "publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; \
  ValueName: "DeerFriend"; ValueData: """{app}\{#AppExe}"""; Tasks: startup; Flags: uninsdeletevalue

[Run]
Filename: "{app}\{#AppExe}"; Description: "Start {#AppName} now"; Flags: nowait postinstall skipifsilent

[Code]
// She's drawn by WebView2, which ships with Windows 11 and most Windows 10 machines.
function InitializeSetup(): Boolean;
var
  Version: String;
begin
  Result := True;
  if not (RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version)
       or RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version)) then
    MsgBox('Deer Friend needs the Microsoft Edge WebView2 runtime, which doesn''t seem to be installed.' + #13#10 +
           'Install it free from https://go.microsoft.com/fwlink/p/?LinkId=2124703 and then run Deer Friend.',
           mbInformation, MB_OK);
end;
