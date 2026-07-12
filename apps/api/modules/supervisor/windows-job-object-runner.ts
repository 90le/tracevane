import process from "node:process";
import { gzipSync } from "node:zlib";

const WINDOWS_COMMAND_LINE_LIMIT = 32_767;

const WINDOWS_JOB_OBJECT_RUNNER_CSHARP = String.raw`using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class TracevaneWindowsJobRunner
{
    private const uint CREATE_SUSPENDED = 0x00000004;
    private const uint CREATE_NO_WINDOW = 0x08000000;
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    private const uint SYNCHRONIZE = 0x00100000;
    private const int JobObjectBasicAccountingInformation = 1;
    private const int JobObjectExtendedLimitInformation = 9;
    private const uint INFINITE = 0xFFFFFFFF;
    private const uint WAIT_OBJECT_0 = 0x00000000;
    private const uint WAIT_FAILED = 0xFFFFFFFF;
    private const uint WATCHDOG_EXIT_CODE = 1;

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_ACCOUNTING_INFORMATION
    {
        public long TotalUserTime;
        public long TotalKernelTime;
        public long ThisPeriodTotalUserTime;
        public long ThisPeriodTotalKernelTime;
        public uint TotalPageFaultCount;
        public uint TotalProcesses;
        public uint ActiveProcesses;
        public uint TotalTerminatedProcesses;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct STARTUPINFO
    {
        public uint cb;
        public IntPtr lpReserved;
        public IntPtr lpDesktop;
        public IntPtr lpTitle;
        public uint dwX;
        public uint dwY;
        public uint dwXSize;
        public uint dwYSize;
        public uint dwXCountChars;
        public uint dwYCountChars;
        public uint dwFillAttribute;
        public uint dwFlags;
        public ushort wShowWindow;
        public ushort cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_INFORMATION
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public uint dwProcessId;
        public uint dwThreadId;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObjectW(IntPtr jobAttributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(
        IntPtr job,
        int informationClass,
        ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION information,
        uint informationLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool QueryInformationJobObject(
        IntPtr job,
        int informationClass,
        ref JOBOBJECT_BASIC_ACCOUNTING_INFORMATION information,
        uint informationLength,
        IntPtr returnLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateJobObject(IntPtr job, uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(
        uint desiredAccess,
        bool inheritHandle,
        uint processId);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcessW(
        string applicationName,
        StringBuilder commandLine,
        IntPtr processAttributes,
        IntPtr threadAttributes,
        bool inheritHandles,
        uint creationFlags,
        IntPtr environment,
        string currentDirectory,
        ref STARTUPINFO startupInfo,
        out PROCESS_INFORMATION processInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr thread);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForMultipleObjects(
        uint count,
        IntPtr[] handles,
        bool waitAll,
        uint milliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr process, uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    private static Win32Exception LastError(string operation)
    {
        return new Win32Exception(Marshal.GetLastWin32Error(), operation + " failed");
    }

    private static uint ActiveProcessCount(IntPtr job)
    {
        var information = new JOBOBJECT_BASIC_ACCOUNTING_INFORMATION();
        if (!QueryInformationJobObject(
            job,
            JobObjectBasicAccountingInformation,
            ref information,
            (uint)Marshal.SizeOf(typeof(JOBOBJECT_BASIC_ACCOUNTING_INFORMATION)),
            IntPtr.Zero))
        {
            throw LastError("QueryInformationJobObject");
        }
        return information.ActiveProcesses;
    }

    private static void DrainJob(IntPtr job, uint exitCode)
    {
        if (ActiveProcessCount(job) == 0) return;
        if (!TerminateJobObject(job, exitCode))
        {
            throw LastError("TerminateJobObject");
        }
        var deadline = Stopwatch.StartNew();
        while (ActiveProcessCount(job) != 0)
        {
            if (deadline.ElapsedMilliseconds >= 5000)
            {
                throw new TimeoutException("Windows Job Object descendants did not exit");
            }
            Thread.Sleep(10);
        }
    }

    public static int Run(
        string applicationName,
        string commandLine,
        string currentDirectory,
        uint watchdogPid)
    {
        if (String.IsNullOrWhiteSpace(applicationName))
            throw new ArgumentException("applicationName is required", "applicationName");
        if (String.IsNullOrWhiteSpace(commandLine))
            throw new ArgumentException("commandLine is required", "commandLine");
        if (String.IsNullOrWhiteSpace(currentDirectory))
            throw new ArgumentException("currentDirectory is required", "currentDirectory");
        if (watchdogPid == 0)
            throw new ArgumentException("watchdogPid is required", "watchdogPid");

        IntPtr job = IntPtr.Zero;
        IntPtr watchdogProcess = IntPtr.Zero;
        var processInformation = new PROCESS_INFORMATION();
        bool processCreated = false;
        bool processAssigned = false;
        try
        {
            watchdogProcess = OpenProcess(SYNCHRONIZE, false, watchdogPid);
            if (watchdogProcess == IntPtr.Zero) throw LastError("OpenProcess");

            job = CreateJobObjectW(IntPtr.Zero, null);
            if (job == IntPtr.Zero) throw LastError("CreateJobObjectW");

            var limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if (!SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                ref limits,
                (uint)Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION))))
            {
                throw LastError("SetInformationJobObject");
            }

            var startupInfo = new STARTUPINFO();
            startupInfo.cb = (uint)Marshal.SizeOf(typeof(STARTUPINFO));
            var mutableCommandLine = new StringBuilder(commandLine);
            if (!CreateProcessW(
                applicationName,
                mutableCommandLine,
                IntPtr.Zero,
                IntPtr.Zero,
                false,
                CREATE_SUSPENDED | CREATE_NO_WINDOW,
                IntPtr.Zero,
                currentDirectory,
                ref startupInfo,
                out processInformation))
            {
                throw LastError("CreateProcessW");
            }
            processCreated = true;

            if (!AssignProcessToJobObject(job, processInformation.hProcess))
            {
                throw LastError("AssignProcessToJobObject");
            }
            processAssigned = true;

            if (ResumeThread(processInformation.hThread) == UInt32.MaxValue)
            {
                throw LastError("ResumeThread");
            }
            var waitHandles = new IntPtr[] {
                watchdogProcess,
                processInformation.hProcess,
            };
            var waitResult = WaitForMultipleObjects(
                (uint)waitHandles.Length,
                waitHandles,
                false,
                INFINITE);
            if (waitResult == WAIT_FAILED)
            {
                throw LastError("WaitForMultipleObjects");
            }
            if (waitResult == WAIT_OBJECT_0)
            {
                DrainJob(job, WATCHDOG_EXIT_CODE);
                return unchecked((int)WATCHDOG_EXIT_CODE);
            }
            if (waitResult != WAIT_OBJECT_0 + 1)
            {
                throw new InvalidOperationException("Unexpected wait result");
            }
            uint exitCode;
            if (!GetExitCodeProcess(processInformation.hProcess, out exitCode))
            {
                throw LastError("GetExitCodeProcess");
            }

            DrainJob(job, exitCode);
            return unchecked((int)exitCode);
        }
        finally
        {
            if (processCreated && !processAssigned && processInformation.hProcess != IntPtr.Zero)
            {
                TerminateProcess(processInformation.hProcess, 1);
                WaitForSingleObject(processInformation.hProcess, 5000);
            }
            if (processInformation.hThread != IntPtr.Zero) CloseHandle(processInformation.hThread);
            if (processInformation.hProcess != IntPtr.Zero) CloseHandle(processInformation.hProcess);
            if (job != IntPtr.Zero) CloseHandle(job);
            if (watchdogProcess != IntPtr.Zero) CloseHandle(watchdogProcess);
        }
    }
}`;

export interface WindowsJobObjectRunnerOptions {
  entryPath: string;
  args: string[];
  cwd: string;
  watchdogPid: number;
}

export interface WindowsJobObjectRunnerLaunch {
  command: string;
  args: string[];
}

function quoteWindowsCommandLineArgument(argument: string): string {
  let quoted = '"';
  let backslashes = 0;
  for (const character of argument) {
    if (character === "\\") {
      backslashes += 1;
      continue;
    }
    if (character === '"') {
      quoted += "\\".repeat(backslashes * 2 + 1);
      quoted += '"';
      backslashes = 0;
      continue;
    }
    quoted += "\\".repeat(backslashes);
    quoted += character;
    backslashes = 0;
  }
  quoted += "\\".repeat(backslashes * 2);
  return `${quoted}"`;
}

function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

export function createWindowsJobObjectRunnerLaunch(
  options: WindowsJobObjectRunnerOptions,
): WindowsJobObjectRunnerLaunch {
  if (
    !Number.isSafeInteger(options.watchdogPid) ||
    options.watchdogPid <= 0 ||
    options.watchdogPid > 0xffff_ffff
  ) {
    throw new Error("Windows Job Object runner requires a valid watchdog PID");
  }
  const commandLine = [process.execPath, options.entryPath, ...options.args]
    .map(quoteWindowsCommandLineArgument)
    .join(" ");
  if (commandLine.length >= WINDOWS_COMMAND_LINE_LIMIT) {
    throw new Error("Windows daemon command line exceeds CreateProcessW limit");
  }
  const payload = Buffer.from(JSON.stringify({
    applicationName: process.execPath,
    commandLine,
    cwd: options.cwd,
    watchdogPid: options.watchdogPid,
  }), "utf8").toString("base64");
  const compressedSource = gzipSync(
    Buffer.from(WINDOWS_JOB_OBJECT_RUNNER_CSHARP, "utf8"),
  ).toString("base64");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$sourceArchive = [Convert]::FromBase64String('${compressedSource}')`,
    "$sourceInput = New-Object IO.MemoryStream(,$sourceArchive)",
    "$sourceStream = New-Object IO.Compression.GzipStream($sourceInput, [IO.Compression.CompressionMode]::Decompress)",
    "$sourceReader = New-Object IO.StreamReader($sourceStream, [Text.Encoding]::UTF8)",
    "try { $source = $sourceReader.ReadToEnd() } finally { $sourceReader.Dispose() }",
    "Add-Type -TypeDefinition $source -Language CSharp -ErrorAction Stop",
    `$payloadJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}'))`,
    "$payload = ConvertFrom-Json -InputObject $payloadJson -ErrorAction Stop",
    "$exitCode = [TracevaneWindowsJobRunner]::Run([string]$payload.applicationName, [string]$payload.commandLine, [string]$payload.cwd, [uint32]$payload.watchdogPid)",
    "exit $exitCode",
  ].join("\n");
  const encodedCommand = encodePowerShellCommand(script);
  if (encodedCommand.length + 128 >= WINDOWS_COMMAND_LINE_LIMIT) {
    throw new Error("Windows Job Object runner command exceeds PowerShell limit");
  }
  return {
    command: "powershell.exe",
    args: [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-WindowStyle",
      "Hidden",
      "-EncodedCommand",
      encodedCommand,
    ],
  };
}
