import deepEqual from "fast-deep-equal"
import React, { memo, useEffect, useMemo, useRef, useState } from "react"
import { useSize } from "react-use"
import { BrowserActionResult, ClineMessage, ClineSayBrowserAction } from "../../../../src/shared/ExtensionMessage"
import { vscode } from "../../utils/vscode"
import CodeAccordian from "../common/CodeAccordian"
import CodeBlock, { CODE_BLOCK_BG_COLOR } from "../common/CodeBlock"
import { ChatRowContent } from "./ChatRow"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"

interface BrowserSessionRowProps {
	messages: ClineMessage[]
	isExpanded: boolean
	onToggleExpand: () => void
	lastModifiedMessage?: ClineMessage
	isLast: boolean
	onHeightChange: (isTaller: boolean) => void
}

/*

- console logs will be aggregate up to that current page
*/

const BrowserSessionRow = memo((props: BrowserSessionRowProps) => {
	const { messages, isLast, onHeightChange } = props
	const prevHeightRef = useRef(0)

	// Organize messages into pages with current state and next action
	const pages = useMemo(() => {
		const result: {
			currentState: {
				url?: string
				screenshot?: string
				messages: ClineMessage[] // messages up to and including the result
			}
			nextAction?: {
				messages: ClineMessage[] // messages leading to next result
			}
		}[] = []

		let currentStateMessages: ClineMessage[] = []
		let nextActionMessages: ClineMessage[] = []

		messages.forEach((message) => {
			if (message.ask === "browser_action_launch") {
				// Start first page
				currentStateMessages = [message]
			} else if (message.say === "browser_action_result") {
				// Complete current state
				currentStateMessages.push(message)
				const resultData = JSON.parse(message.text || "{}") as BrowserActionResult

				// Add page with current state and previous next actions
				result.push({
					currentState: {
						url: resultData.currentUrl,
						screenshot: resultData.screenshot,
						messages: [...currentStateMessages],
					},
					nextAction:
						nextActionMessages.length > 0
							? {
									messages: [...nextActionMessages],
							  }
							: undefined,
				})

				// Reset for next page
				currentStateMessages = []
				nextActionMessages = []
			} else if (
				message.say === "api_req_started" ||
				message.say === "text" ||
				message.say === "browser_action"
			) {
				// These messages lead to the next result, so they should always go in nextActionMessages
				nextActionMessages.push(message)
			} else {
				// Any other message types
				currentStateMessages.push(message)
			}
		})

		// Add incomplete page if exists
		if (currentStateMessages.length > 0 || nextActionMessages.length > 0) {
			result.push({
				currentState: {
					messages: [...currentStateMessages],
				},
				nextAction:
					nextActionMessages.length > 0
						? {
								messages: [...nextActionMessages],
						  }
						: undefined,
			})
		}

		return result
	}, [messages])

	// Auto-advance to latest page
	const [currentPageIndex, setCurrentPageIndex] = useState(0)
	useEffect(() => {
		setCurrentPageIndex(pages.length - 1)
	}, [pages.length])

	// Get initial URL from launch message
	const initialUrl = useMemo(() => {
		const launchMessage = messages.find((m) => m.ask === "browser_action_launch")
		return launchMessage?.text || ""
	}, [messages])

	// Find the latest available URL and screenshot
	const latestState = useMemo(() => {
		for (let i = pages.length - 1; i >= 0; i--) {
			const page = pages[i]
			if (page.currentState.url || page.currentState.screenshot) {
				return {
					url: page.currentState.url,
					screenshot: page.currentState.screenshot,
				}
			}
		}
		return { url: undefined, screenshot: undefined }
	}, [pages])

	const currentPage = pages[currentPageIndex]
	const isLastPage = currentPageIndex === pages.length - 1

	// Use latest state if we're on the last page and don't have a state yet
	const displayState = isLastPage
		? {
				url: currentPage?.currentState.url || latestState.url || initialUrl,
				screenshot: currentPage?.currentState.screenshot || latestState.screenshot,
		  }
		: {
				url: currentPage?.currentState.url || initialUrl,
				screenshot: currentPage?.currentState.screenshot,
		  }

	const [browserSessionRow, { height }] = useSize(
		<div style={{ padding: "10px 6px 10px 15px" }}>
			<div
				style={{
					borderRadius: 3,
					border: "1px solid var(--vscode-editorGroup-border)",
					overflow: "hidden",
					backgroundColor: CODE_BLOCK_BG_COLOR,
				}}>
				{/* URL Bar */}
				<div
					style={{
						margin: "5px auto",
						width: "calc(100% - 10px)",
						backgroundColor: "var(--vscode-input-background)",
						border: "1px solid var(--vscode-input-border)",
						borderRadius: "4px",
						padding: "3px 5px",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						color: "var(--vscode-input-foreground)",
						fontSize: "12px",
						wordBreak: "break-all",
						whiteSpace: "normal",
					}}>
					{displayState.url}
				</div>

				{/* Screenshot Area */}
				<div
					style={{
						width: "100%",
						paddingBottom: "75%",
						position: "relative",
						backgroundColor: "var(--vscode-input-background)",
					}}>
					{displayState.screenshot ? (
						<img
							src={displayState.screenshot}
							alt="Browser screenshot"
							style={{
								position: "absolute",
								top: 0,
								left: 0,
								width: "100%",
								height: "100%",
								objectFit: "contain",
							}}
							onClick={() =>
								vscode.postMessage({
									type: "openImage",
									text: displayState.screenshot,
								})
							}
						/>
					) : (
						<div
							style={{
								position: "absolute",
								top: "50%",
								left: "50%",
								transform: "translate(-50%, -50%)",
							}}>
							<span
								className="codicon codicon-globe"
								style={{ fontSize: "80px", color: "var(--vscode-descriptionForeground)" }}
							/>
						</div>
					)}
				</div>

				{/* Pagination */}
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						padding: "8px",
						borderTop: "1px solid var(--vscode-editorGroup-border)",
					}}>
					<div>
						Step {currentPageIndex + 1} of {pages.length}
					</div>
					<div style={{ display: "flex", gap: "4px" }}>
						<VSCodeButton
							disabled={currentPageIndex === 0}
							onClick={() => setCurrentPageIndex((i) => i - 1)}>
							Previous
						</VSCodeButton>
						<VSCodeButton
							disabled={currentPageIndex === pages.length - 1}
							onClick={() => setCurrentPageIndex((i) => i + 1)}>
							Next
						</VSCodeButton>
					</div>
				</div>
			</div>

			{/* Show next action messages if they exist */}
			{currentPage?.nextAction?.messages.map((message) => (
				<BrowserSessionRowContent key={message.ts} {...props} message={message} />
			))}
		</div>
	)

	// Height change effect
	useEffect(() => {
		const isInitialRender = prevHeightRef.current === 0
		if (isLast && height !== 0 && height !== Infinity && height !== prevHeightRef.current) {
			if (!isInitialRender) {
				onHeightChange(height > prevHeightRef.current)
			}
			prevHeightRef.current = height
		}
	}, [height, isLast, onHeightChange])

	return browserSessionRow
}, deepEqual)

interface BrowserSessionRowContentProps extends Omit<BrowserSessionRowProps, "messages"> {
	message: ClineMessage
}

const BrowserSessionRowContent = ({
	message,
	isExpanded,
	onToggleExpand,
	lastModifiedMessage,
	isLast,
}: BrowserSessionRowContentProps) => {
	const headerStyle: React.CSSProperties = {
		display: "flex",
		alignItems: "center",
		gap: "10px",
		marginBottom: "10px",
	}

	// Copy all the rendering logic from ChatRowContent
	// This includes handling all message types: api_req_started, browser_action, text, etc.
	// The implementation would be identical to ChatRowContent

	switch (message.type) {
		case "say":
			switch (message.say) {
				case "api_req_started":
				case "text":
					return (
						<ChatRowContent
							message={message}
							isExpanded={isExpanded}
							onToggleExpand={onToggleExpand}
							lastModifiedMessage={lastModifiedMessage}
							isLast={isLast}
						/>
					)

				case "browser_action":
					const browserAction = JSON.parse(message.text || "{}") as ClineSayBrowserAction
					return (
						<div style={{ marginBottom: 10 }}>
							<div style={{ fontWeight: "bold" }}>{browserAction.action}</div>
							{browserAction.coordinate && <div>{browserAction.coordinate}</div>}
							{browserAction.text && <div>{browserAction.text}</div>}
						</div>
					)

				case "browser_action_result":
					const { screenshot, logs, currentMousePosition, currentUrl } = JSON.parse(
						message.text || "{}"
					) as BrowserActionResult
					return (
						<div style={{ marginBottom: 10 }}>
							{currentMousePosition && <div>{currentMousePosition}</div>}
							{currentUrl && <div>{currentUrl}</div>}
							{screenshot && (
								<img
									src={screenshot}
									alt="Browser action screenshot"
									style={{
										width: "calc(100% - 2px)",
										height: "auto",
										objectFit: "contain",
										marginBottom: logs ? 7 : 0,
										borderRadius: 3,
										cursor: "pointer",
										marginLeft: "1px",
									}}
									onClick={() => vscode.postMessage({ type: "openImage", text: screenshot })}
								/>
							)}
							{logs && (
								<CodeAccordian
									code={logs}
									language="shell"
									isConsoleLogs={true}
									isExpanded={isExpanded}
									onToggleExpand={onToggleExpand}
								/>
							)}
						</div>
					)

				default:
					return null
			}

		case "ask":
			switch (message.ask) {
				case "browser_action_launch":
					return (
						<>
							<div style={headerStyle}>
								<span style={{ fontWeight: "bold" }}>Browser Session Started</span>
							</div>
							<div
								style={{
									borderRadius: 3,
									border: "1px solid var(--vscode-editorGroup-border)",
									overflow: "hidden",
									backgroundColor: CODE_BLOCK_BG_COLOR,
								}}>
								<CodeBlock source={`${"```"}shell\n${message.text}\n${"```"}`} forceWrap={true} />
							</div>
						</>
					)

				default:
					return null
			}
	}
}

const BrowserCursor: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
	// (can't use svgs in vsc extensions)
	const cursorBase64 =
		"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABUAAAAYCAYAAAAVibZIAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAFaADAAQAAAABAAAAGAAAAADwi9a/AAADGElEQVQ4EZ2VbUiTURTH772be/PxZdsz3cZwC4RVaB8SAjMpxQwSWZbQG/TFkN7oW1Df+h6IRV9C+hCpKUSIZUXOfGM5tAKViijFFEyfZ7Ol29S1Pbdzl8Uw9+aBu91zzv3/nt17zt2DEZjBYOAkKrtFMXIghAWM8U2vMN/FctsxGRMpM7NbEEYNMM2CYUSInlJx3OpawO9i+XSNQYkmk2uFb9njzkcfVSr1p/GJiQKMULVaw2WuBv296UKRxWJR6wxGCmM1EAhSNppv33GBH9qI32cPTAtss9lUm6EM3N7R+RbigT+5/CeosFCZKpjEW+iorS1pb30wDUXzQfHqtD/9L3ieZ2ee1OJCmbL8QHnRs+4uj0wmW4QzrpCwvJ8zGg3JqAmhTLynuLiwv8/5KyND8Q3cEkUEDWu15oJE4KRQJt5hs1rcriGNRqP+DK4dyyWXXm/aFQ+cEpSJ8/LyDGPuEZNOmzsOroUSOqzXG/dtBU4ZysTZYKNut91sNo2Cq6cE9enz86s2g9OCMrFSqVC5hgb32u072W3jKMU90Hb1seC0oUwsB+t92bO/rKx0EFGkgFCnjjc1/gVvC8rE0L+4o63t4InjxwbAJQjTe3qD8QrLkXA4DC24fWtuajp06cLFYSBIFKGmXKPRRmAnME9sPt+yLwIWb9WN69fKoTneQz4Dh2mpPNkvfeV0jjecb9wNAkwIEVQq5VJOds4Kb+DXoAsiVquVwI1Dougpij6UyGYx+5cKroeDEFibm5lWRRMbH1+npmYrq6qhwlQHIbajZEf1fElcqGGFpGg9HMuKzpfBjhytCTMgkJ56RX09zy/ysENTBElmjIgJnmNChJqohDVQqpEfwkILE8v/o0GAnV9F1eEvofVQCbiTBEXOIPQh5PGgefDZeAcjrpGZjULBr/m3tZOnz7oEQWRAQZLjWlEU/XEJWySiILgRc5Cz1DkcAyuBFcnpfF0JiXWKpcolQXizhS5hKAqFpr0MVbgbuxJ6+5xX+P4wNpbqPPrugZfbmIbLmgQR3Aw8QSi66hUXulOFbF73GxqjE5BNXWNeAAAAAElFTkSuQmCC"

	return (
		<img
			src={cursorBase64}
			style={{
				width: "17px",
				height: "22px",
				...style,
			}}
			alt="cursor"
		/>
	)
}

export default BrowserSessionRow