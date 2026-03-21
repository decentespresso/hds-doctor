import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

const MAX_POINTS = 200

export const LiveChart = {
  plot: null as uPlot | null,
  data: [[], [], []] as [number[], number[], number[]],  // [timestamps, smoothed, stdDev]
  startTime: 0,

  init(container: HTMLElement): void {
    this.destroy()
    this.data = [[], [], []]
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
        {
          label: 'Std Dev',
          stroke: '#e67700',
          width: 2,
          scale: 'stddev',
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
        {
          label: 'Std Dev',
          scale: 'stddev',
          side: 1,  // right
          stroke: '#e67700',
          grid: { show: false },
        },
      ],
      scales: {
        smoothed: { auto: true },
        stddev: { auto: true },
      },
      cursor: { show: true },
      legend: { show: true },
    }

    this.plot = new uPlot(opts, this.data, container)

    // Handle resize
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        this.plot?.setSize({ width: entry.contentRect.width, height: 250 })
      }
    })
    ro.observe(container)
  },

  addPoint(timestamp: number, smoothed: number, stdDev: number): void {
    if (!this.plot) return

    if (this.startTime === 0) this.startTime = timestamp
    const t = (timestamp - this.startTime) / 1000  // seconds

    this.data[0].push(t)
    this.data[1].push(smoothed)
    this.data[2].push(stdDev)

    // Trim to rolling window
    while (this.data[0].length > MAX_POINTS) {
      this.data[0].shift()
      this.data[1].shift()
      this.data[2].shift()
    }

    this.plot.setData(this.data)
  },

  destroy(): void {
    this.plot?.destroy()
    this.plot = null
    this.data = [[], [], []]
    this.startTime = 0
  },
}
