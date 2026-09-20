import AVFoundation
import Foundation
import Speech

let recognizer = SFSpeechRecognizer(locale: Locale.current)
let audioEngine = AVAudioEngine()
let request = SFSpeechAudioBufferRecognitionRequest()
let finished = DispatchSemaphore(value: 0)

guard let recognizer, recognizer.isAvailable else {
    FileHandle.standardError.write(Data("系统语音识别不可用\n".utf8))
    exit(1)
}

SFSpeechRecognizer.requestAuthorization { status in
    guard status == .authorized else {
        FileHandle.standardError.write(Data("未获得语音识别权限\n".utf8))
        finished.signal()
        return
    }

    let inputNode = audioEngine.inputNode
    let format = inputNode.outputFormat(forBus: 0)
    inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
        request.append(buffer)
    }

    do {
        audioEngine.prepare()
        try audioEngine.start()
    } catch {
        FileHandle.standardError.write(Data("无法启动麦克风：\(error)\n".utf8))
        finished.signal()
        return
    }

    recognizer.recognitionTask(with: request) { result, error in
        if let result, result.isFinal {
            print(result.bestTranscription.formattedString)
            audioEngine.stop()
            inputNode.removeTap(onBus: 0)
            request.endAudio()
            finished.signal()
        } else if let error {
            FileHandle.standardError.write(Data("语音识别失败：\(error)\n".utf8))
            audioEngine.stop()
            inputNode.removeTap(onBus: 0)
            request.endAudio()
            finished.signal()
        }
    }
}

finished.wait()
