import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

const MAX_POINTS = 200

export const LiveChart = {
  plot: null as uPlot | null,
  data: [[], []] as [number[], number[]],  // [timestamps, smoothed]
  startTime: 0,
  resizeObserver: null as ResizeObserver | null,

  init(container: HTMLElement): void {
    this.destroy()
    this.data = [[], []]
    this.startTime = 0

    const opts: uPlot.Options = {
      width: container.clientWidth,
      height: 250,
      series: [
        { label: 'Time (s)' },
        {
          label: 'Smoothed',
          stroke: '#47cdd9',
          width: 2,
          scale: 'smoothed',
        },
      ],
      axes: [
        { label: 'Time (s)' },
        {
          label: 'Smoothed Value',
          scale: 'smoothed',
          side: 3,  // left
          stroke: '#47cdd9',
        },
      ],
      scales: {
        x: { time: false },
        smoothed: { auto: true },
      },
      cursor: { show: true },
      legend: { show: true },
    }

    this.plot = new uPlot(opts, this.data, container)

    // Handle resize
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        this.plot?.setSize({ width: entry.contentRect.width, height: 250 })
      }
    })
    this.resizeObserver.observe(container)
  },

  addPoint(timestamp: number, smoothed: number): void {
    if (!this.plot) return

    if (this.startTime === 0) this.startTime = timestamp
    const t = (timestamp - this.startTime) / 1000  // seconds

    this.data[0].push(t)
    this.data[1].push(smoothed)

    // Trim to rolling window
    while (this.data[0].length > MAX_POINTS) {
      this.data[0].shift()
      this.data[1].shift()
    }

    this.plot.setData(this.data)
  },

  destroy(): void {
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.plot?.destroy()
    this.plot = null
    this.data = [[], []]
    this.startTime = 0
  },
}
