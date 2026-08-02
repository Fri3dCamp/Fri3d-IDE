from mpos import Activity
import lvgl as lv


class Main(Activity):
    def onCreate(self):
        screen = lv.obj()
        title = lv.label(screen)
        title.set_text("Progress: 70%")
        title.align(lv.ALIGN.CENTER, 0, -35)

        progress = lv.bar(screen)
        progress.set_width(220)
        progress.set_value(70, lv.ANIM.OFF)
        progress.align(lv.ALIGN.CENTER, 0, 15)
        self.setContentView(screen)
