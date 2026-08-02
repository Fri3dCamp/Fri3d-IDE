from mpos import Activity
import lvgl as lv


class Main(Activity):
    def onCreate(self):
        screen = lv.obj()
        prompt = lv.label(screen)
        prompt.set_text("Enter your name")
        prompt.align(lv.ALIGN.TOP_MID, 0, 45)

        text = lv.textarea(screen)
        text.set_one_line(True)
        text.set_placeholder_text("Name")
        text.set_width(220)
        text.align(lv.ALIGN.TOP_MID, 0, 80)
        self.setContentView(screen)
