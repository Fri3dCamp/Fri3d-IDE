from mpos import Activity
import lvgl as lv


class Main(Activity):
    def onCreate(self):
        screen = lv.obj()
        button = lv.button(screen)
        button.center()
        label = lv.label(button)
        label.set_text("Click me")
        label.center()

        def on_click(event):
            label.set_text("Clicked!")

        button.add_event_cb(on_click, lv.EVENT.CLICKED, None)
        self.setContentView(screen)
